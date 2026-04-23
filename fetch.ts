import https from 'https';
https.get('https://raw.githubusercontent.com/Sami001-OG/Multi-Confluence-Scalper-btc-eth-sol-/main/server.ts', res => { let d=''; res.on('data', c=>d+=c); res.on('end', ()=>console.log(d)) });
