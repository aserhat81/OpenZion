export async function fetchUrl(url: string): Promise<string> {
    try {
        const res = await fetch(url);
        const text = await res.text();

        const cheerio = require('cheerio');
        const $ = cheerio.load(text);

        $('script, style, link, meta, noscript').remove();

        const bodyText = $('body').text().replace(/\\s+/g, ' ').trim();
        return bodyText.substring(0, 15000) + (bodyText.length > 15000 ? '\n...[truncated]' : '');
    } catch (e: any) {
        return `Failed to fetch URL: ${e.message}`;
    }
}
