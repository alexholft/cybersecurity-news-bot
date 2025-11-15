// cyberNews.js - Gemini + Zapier Webhook 버전
require('dotenv').config();
const Parser = require('rss-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const parser = new Parser();

// 1. 보안 뉴스 RSS 소스 정의
const RSS_SOURCES = [
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews?format=xml' },
  { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
  { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml' },
];

// 메인 실행 함수
async function main() {
  try {
    console.log('🔍 Fetching cybersecurity news...');
    const articles = await fetchAllSources();

    if (!articles.length) {
      console.log('No articles found.');
      return;
    }

    console.log(`✅ Fetched ${articles.length} articles. Summarizing with Gemini...`);
    const summary = await summarizeWithGemini(articles);

    console.log('📨 Sending to Zapier...');
    await sendToZapier(summary, articles);

    console.log('✅ Done!');
  } catch (err) {
    console.error('❌ Error in main():', err);
  }
}

// 2. 여러 RSS에서 기사 모으기
async function fetchAllSources() {
  const all = [];

  for (const source of RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      const items = feed.items || [];

      // 각 소스당 최신 5개씩만
      items.slice(0, 5).forEach((item) => {
        all.push({
          source: source.name,
          title: item.title || '',
          link: item.link || '',
          isoDate: item.isoDate || item.pubDate || '',
          description: item.contentSnippet || item.content || item.summary || '',
        });
      });
    } catch (err) {
      console.error(`Error fetching ${source.name}:`, err.message);
    }
  }

  // 날짜 기준 최신순 정렬
  all.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));

  // 전체에서 상위 10개만 사용
  return all.slice(0, 10);
}

// 3. Gemini 2.5 Pro로 요약하기
async function summarizeWithGemini(articles) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing (.env에 설정 필요)');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

  // 기사 텍스트 합치기
  const articleText = articles
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}\n${a.description}\n${a.link}`)
    .join('\n\n');

  const prompt = `
한국 보안 담당자용 사이버보안 뉴스 요약:
- 아래 기사 목록을 보고, 핵심 이슈를 5~7개 bullet point로 정리해줘.
- 각 bullet은 (이슈 요약) + (왜 중요한지, 시사점)을 같이 적어줘.
- 한국어로만 작성해줘.

기사 목록:
${articleText}
`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  return text;
}

// 4. Zapier Webhook으로 요약/기사 전송
async function sendToZapier(summary, articles) {
  const webhook = process.env.ZAPIER_WEBHOOK_URL;
  if (!webhook) throw new Error("ZAPIER_WEBHOOK_URL missing (.env에 설정 필요)");

  // Zapier로 보낼 데이터 구조
  const payload = {
    summary,   // Gemini 요약 텍스트
    articles,  // 기사 배열 (source, title, link, description, isoDate)
  };

  await axios.post(webhook, payload);

  console.log("📨 Sent to Zapier!");
}

// 실행
main();
