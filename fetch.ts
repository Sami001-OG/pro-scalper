import https from 'https';
https.get('https://api.github.com/repos/Sami001-OG/Multi-Confluence-Scalper-btc-eth-sol-/contents/src', {headers: {'User-Agent': 'Node.js'}}, res => { let d=''; res.on('data', c=>d+=c); res.on('end', ()=>console.log(d)) });
