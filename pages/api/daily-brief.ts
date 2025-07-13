import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import nodemailer from "nodemailer";
import { parseStringPromise } from "xml2js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY;
const productHuntApiKey = process.env.PRODUCT_HUNT_API_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const fmpApiKey = process.env.FMP_API_KEY;

interface FeedItem {
  title?: string[];
  description?: string[];
  link?: string[];
  pubDate?: string[];
}

interface RSSFeed {
  rss?: {
    channel?: Array<{
      item?: FeedItem[];
    }>;
  };
}

async function fetchAndParseRSS(url: string): Promise<FeedItem[]> {
  try {
    const response = await fetch(url);
    const xml = await response.text();
    const result = (await parseStringPromise(xml)) as RSSFeed;
    return result.rss?.channel?.[0]?.item || [];
  } catch (error) {
    console.error(`Error fetching RSS from ${url}:`, error);
    return [];
  }
}

async function fetchMarketData(): Promise<string> {
  try {
    const symbols = ["SPY", "QQQ"];
    const marketData: {
      [key: string]: { price: number; changePercent: string };
    } = {};

    for (const symbol of symbols) {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${alphaVantageApiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Alpha Vantage API error for ${symbol}:`, errorText);
        throw new Error(
          `Alpha Vantage API failed with status ${response.status}: ${errorText}`
        );
      }

      const data = await response.json();
      const timeSeries = data["Time Series (Daily)"];

      if (!timeSeries) {
        console.error(`Response data for ${symbol}:`, data);
        throw new Error(
          `Unexpected Alpha Vantage response format for ${symbol}`
        );
      }

      const dates = Object.keys(timeSeries).sort().slice(-2);
      if (dates.length < 2) {
        throw new Error(`Insufficient data for ${symbol} change calculation`);
      }

      const closeKey = "4. close";
      const latestCloseRaw = timeSeries[dates[1]][closeKey];
      const previousCloseRaw = timeSeries[dates[0]][closeKey];
      console.log(
        `Raw close values for ${symbol}: latest=${latestCloseRaw}, previous=${previousCloseRaw}`
      );
      const latestClose = parseFloat(latestCloseRaw);
      const previousClose = parseFloat(previousCloseRaw);
      const change = latestClose - previousClose;
      const changePercent = (change / previousClose) * 100;

      marketData[symbol] = {
        price: latestClose,
        changePercent: changePercent.toFixed(2),
      };
    }

    // Fetch Bitcoin data from CoinGecko
    const cgResponse = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true"
    );

    if (!cgResponse.ok) {
      const errorText = await cgResponse.text();
      console.error("CoinGecko API error:", errorText);
      throw new Error(
        `CoinGecko API failed with status ${cgResponse.status}: ${errorText}`
      );
    }

    const cgData = await cgResponse.json();
    const btcData = cgData["bitcoin"];

    if (!btcData) {
      throw new Error("Unexpected CoinGecko response format");
    }

    const btcPrice = btcData.usd;
    const btcChangePercent = btcData.usd_24h_change.toFixed(2);

    return `Market snapshot: S&P 500 (via SPY): $${marketData[
      "SPY"
    ].price.toFixed(2)} (${
      marketData["SPY"].changePercent
    }%), Nasdaq (via QQQ): $${marketData["QQQ"].price.toFixed(2)} (${
      marketData["QQQ"].changePercent
    }%), Bitcoin: $${btcPrice.toFixed(2)} (${btcChangePercent}%)`;
  } catch (error) {
    console.error("Error fetching market data:", error);
    return "Market data unavailable";
  }
}

async function fetchProductHuntPosts(): Promise<string> {
  try {
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const response = await fetch("https://api.producthunt.com/v2/api/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${productHuntApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query { posts(first: 10, order: VOTES, postedAfter: \"${yesterday}\", postedBefore: \"${now}\") { edges { node { name tagline url votesCount } } } }`,
      }),
    });

    const data = await response.json();
    if (data.errors) {
      console.error("Product Hunt API errors:", data.errors);
      throw new Error(`Product Hunt API error: ${JSON.stringify(data.errors)}`);
    }

    interface ProductHuntNode {
      name: string;
      tagline: string;
      url: string;
      votesCount: number;
    }

    return data.data.posts.edges
      .map(
        ({ node }: { node: ProductHuntNode }) =>
          `${node.name} (${node.url}) - ${node.tagline} (Votes: ${node.votesCount})`
      )
      .join("\n");
  } catch (error) {
    console.error("Error fetching Product Hunt posts:", error);
    return "Product Hunt data unavailable";
  }
}

async function buildBrief(): Promise<string> {
  try {
    const [aiFeed, ycFeed, worldFeed, productHuntSummary, marketData] =
      await Promise.all([
        fetchAndParseRSS("http://arxiv.org/rss/cs.AI"),
        fetchAndParseRSS("https://news.ycombinator.com/rss"),
        fetchAndParseRSS(
          "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"
        ),
        fetchProductHuntPosts(),
        fetchMarketData(),
      ]);

    // Format the feeds for the AI prompt
    const aiSummary = aiFeed
      .slice(0, 10)
      .map(
        (item) =>
          `${item.title?.[0] || "No title"} (${
            item.link?.[0] || "No link"
          }) - ${item.description?.[0] || "No description"}`
      )
      .join("\n");

    const ycSummary = ycFeed
      .slice(0, 10)
      .map(
        (item) =>
          `${item.title?.[0] || "No title"} (${
            item.link?.[0] || "No link"
          }) - ${item.description?.[0] || "No description"}`
      )
      .join("\n");

    const worldSummary = worldFeed
      .slice(0, 10)
      .map(
        (item) =>
          `${item.title?.[0] || "No title"} (${
            item.link?.[0] || "No link"
          }) - ${item.description?.[0] || "No description"}`
      )
      .join("\n");

    const prompt = `
Give me a crisp bullet summary (≤3 sentences each) of:
1. notable AI research news (especially large-model papers),
2. any YC/Techstars company milestones,
3. top world news,
4. top products launched on Product Hunt today,
5. top stories from Hacker News,
6. market close snapshot (S&P 500, Nasdaq, Bitcoin).

Raw feeds:
AI:
${aiSummary}

YC/TECH:
${ycSummary}

WORLD NEWS:
${worldSummary}

PRODUCT HUNT:
${productHuntSummary}

HACKER NEWS:
${ycSummary}  // Reuse for HN stories

MARKETS:
${marketData}

Format the response as a clean, professional daily brief using HTML with clear sections (use <h2> for headings), bullet points (<ul><li>), and ensure it's mobile-friendly with sans-serif font and good spacing. For each summary bullet, include a clickable link (<a href="original_url">Read more</a>) to the source article or paper. Do not include any code fences like \`\`\` in the output.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1500,
    });

    return completion.choices[0].message.content || "Failed to generate brief";
  } catch (error) {
    console.error("Error building brief:", error);
    throw error;
  }
}

async function sendEmail(body: string): Promise<void> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Daily Brief <on@resend.dev>",
        to: ["alhait.omar@gmail.com"],
        subject: `Your Daily Brief — ${new Date().toLocaleDateString("en-US")}`,
        html: body,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Resend API error: ${errorData.message || response.statusText}`
      );
    }

    console.log("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("Starting daily brief generation...");
    const brief = await buildBrief();
    console.log("Brief generated, sending email...");
    await sendEmail(brief);
    console.log("Daily brief sent successfully");

    res.status(200).json({
      success: true,
      message: "Daily brief sent successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in daily brief cron job:", error);
    res.status(500).json({
      error: "Failed to send daily brief",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
