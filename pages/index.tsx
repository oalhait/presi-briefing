import React from "react";

export default function Home() {
  return (
    <div style={{ padding: "40px", maxWidth: "800px", margin: "0 auto" }}>
      <h1>Daily AI & Markets Brief</h1>
      <p>
        This is a cronjob service that sends daily brief emails with AI/tech
        news, world news, and market updates.
      </p>
      <p>The cronjob runs daily at 7 AM PST and sends emails to:</p>
      <ul>
        <li>mail@omar.fyi</li>
        <li>omar@reducto.ai</li>
      </ul>
      <p>The service fetches from:</p>
      <ul>
        <li>Hacker News RSS</li>
        <li>NY Times World RSS</li>
        <li>Market data (placeholder)</li>
      </ul>
    </div>
  );
}
