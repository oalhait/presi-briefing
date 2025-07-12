import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import nodemailer from "nodemailer";
import { parseStringPromise } from "xml2js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY;

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
    const sp500 = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=^GSPC&apikey=${alphaVantageApiKey}`
    ).then((res) => res.json());
    const nasdaq = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=^IXIC&apikey=${alphaVantageApiKey}`
    ).then((res) => res.json());
    const bitcoin = await fetch(
      `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=BTC&to_currency=USD&apikey=${alphaVantageApiKey}`
    ).then((res) => res.json());

    const sp500Price = sp500["Global Quote"]?.["05. price"] || "N/A";
    const sp500Change = sp500["Global Quote"]?.["10. change percent"] || "N/A";
    const nasdaqPrice = nasdaq["Global Quote"]?.["05. price"] || "N/A";
    const nasdaqChange =
      nasdaq["Global Quote"]?.["10. change percent"] || "N/A";
    const bitcoinPrice =
      bitcoin["Realtime Currency Exchange Rate"]?.["5. Exchange Rate"] || "N/A";

    return `Market snapshot: S&P 500: ${sp500Price} (${sp500Change}), Nasdaq: ${nasdaqPrice} (${nasdaqChange}), Bitcoin: $${bitcoinPrice}`;
  } catch (error) {
    console.error("Error fetching market data:", error);
    return "Market data unavailable";
  }
}

async function buildBrief(): Promise<string> {
  try {
    const [aiFeed, ycFeed, worldFeed, marketData] = await Promise.all([
      fetchAndParseRSS("http://arxiv.org/rss/cs.AI"),
      fetchAndParseRSS("https://news.ycombinator.com/rss"),
      fetchAndParseRSS(
        "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"
      ),
      fetchMarketData(),
    ]);

    // Format the feeds for the AI prompt
    const aiSummary = aiFeed
      .slice(0, 10)
      .map(
        (item) =>
          `${item.title?.[0] || "No title"} - ${
            item.description?.[0] || "No description"
          }`
      )
      .join("\n");

    const ycSummary = ycFeed
      .slice(0, 10)
      .map(
        (item) =>
          `${item.title?.[0] || "No title"} - ${
            item.description?.[0] || "No description"
          }`
      )
      .join("\n");

    const worldSummary = worldFeed
      .slice(0, 10)
      .map(
        (item) =>
          `${item.title?.[0] || "No title"} - ${
            item.description?.[0] || "No description"
          }`
      )
      .join("\n");

    const prompt = `
Give me a crisp bullet summary (≤2 sentences each) of:
1. notable AI research news (especially large-model papers),
2. any YC/Techstars company milestones,
3. top world news,
4. market close snapshot (S&P 500, Nasdaq, Bitcoin).

Raw feeds:
AI:
${aiSummary}

YC/TECH:
${ycSummary}

WORLD NEWS:
${worldSummary}

MARKETS:
${marketData}

Format the response as a clean, professional daily brief with clear sections and bullet points.`;

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
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Daily Brief <on@resend.dev>",
        to: ["alhait.omar@gmail.com"],
        subject: `Your Daily AI & Markets Brief — ${new Date().toLocaleDateString(
          "en-US"
        )}`,
        text: body,
        html: `<pre style="font-family: monospace; white-space: pre-wrap; font-size: 14px;">${body}</pre>`,
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
  // Verify this is a cron job request
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
