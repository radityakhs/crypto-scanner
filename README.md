# Crypto Scanner Dashboard

Dashboard crypto berbasis web untuk analisa pasar, sinyal whale, dan expert analysis (moon phase, MA/EMA/MACD, support & resistance) lengkap dengan rekomendasi futures.

## Fitur Utama

- **Moon Phase Expert Analysis**: bias pasar berdasarkan fase bulan.
- **Futures Signal**: rekomendasi long/short/neutral dengan alasan.
- **Timeframe Potential**: ringkasan 1D, 7D, 30D.
- **Chart MA/EMA/MACD** + garis support & resistance.

## Cara Menjalankan

1. Buka file `index.html` di browser.
2. Pilih tab **Crypto Scanner** lalu klik **Analyze** pada coin yang dipilih.

> Catatan: Data diambil dari API CoinGecko, jadi pastikan ada koneksi internet.

## Struktur File Penting

- `index.html` — UI utama.
- `app.js` — logika aplikasi dan analisa.
- `analysis-utils.js` — util moon phase + indikator teknikal.

## Disclaimer

Tool ini bersifat informatif dan bukan saran finansial. Selalu gunakan manajemen risiko.