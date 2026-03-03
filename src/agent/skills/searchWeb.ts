export async function searchWeb(query: string): Promise<string> {
    try {
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
        const text = await res.text();

        const cheerio = require('cheerio');
        const $ = cheerio.load(text);

        const results: string[] = [];
        $('.result').each((i: number, el: any) => {
            if (i >= 5) return false;
            const title = $(el).find('.result__title').text().trim();
            const snippet = $(el).find('.result__snippet').text().trim();
            const href = $(el).find('.result__url').attr('href') || $(el).find('a.result__url').attr('href');
            results.push(`[Title]: ${title}\n[URL]: ${href}\n[Snippet]: ${snippet}\n`);
        });

        if (results.length === 0) return 'No results found.';
        return results.join('\n');
    } catch (e: any) {
        return `Search failed: ${e.message}`;
    }
}
