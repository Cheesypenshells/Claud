// Membaca foto bukti transfer / nota dengan Claude.
// Hanya dipakai kalau ANTHROPIC_API_KEY diisi. Tanpa itu, bot meminta nominal diketik.

import Anthropic from '@anthropic-ai/sdk';
import { DAFTAR_KATEGORI } from './parsers.js';

const SKEMA = {
  type: 'object',
  properties: {
    terbaca: {
      type: 'boolean',
      description: 'true jika gambar adalah bukti transfer, struk, nota, atau tangkapan layar nominal yang bisa dibaca',
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          keterangan: { type: 'string', description: 'Untuk apa uang dikeluarkan, singkat. Contoh: "Lalamove kirim barang ke venue"' },
          nominal: { type: 'integer', description: 'Nominal dalam rupiah, tanpa titik' },
          kategori: { type: 'string', enum: DAFTAR_KATEGORI },
          metode: { type: 'string', enum: ['CASH', 'TRANSFER'] },
        },
        required: ['keterangan', 'nominal', 'kategori', 'metode'],
        additionalProperties: false,
      },
    },
    tanggal: { type: 'string', description: 'Tanggal transaksi YYYY-MM-DD jika terlihat, kosong jika tidak' },
    catatan: { type: 'string', description: 'Hal yang meragukan, kosong jika tidak ada' },
  },
  required: ['terbaca', 'items', 'tanggal', 'catatan'],
  additionalProperties: false,
};

const SISTEM = `Kamu adalah admin keuangan Cheesy Pen Shells, UMKM oyster bakar yang berjualan di bazar.
Tugasmu membaca foto bukti transfer, struk, nota, atau tangkapan layar aplikasi (Lalamove, Gojek, Grab, m-banking, dll)
yang dikirim owner atau PIC ke grup WhatsApp, lalu mencatat nominalnya.

Aturan:
- Gunakan nominal total yang benar-benar dibayar (termasuk ongkos/biaya admin bank jika tercantum di total).
- Satu bukti transfer biasanya satu item. Struk belanja dengan banyak barang cukup dicatat sebagai satu item total,
  kecuali keterangan dari pengirim meminta dipisah.
- Pakai keterangan dari pengirim (caption) bila ada; foto hanya sumber nominal dan detail.
- Mode "MASUK_IO" berarti ini transfer MASUK dari event organizer (IO) ke Cheesy Pen Shells; isi kategori "Lain-lain".
- Jika gambar tidak berisi nominal yang bisa dibaca, set terbaca=false dan items kosong. Jangan menebak angka.`;

export class Pembaca {
  constructor({ apiKey, model }) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  // Mengembalikan { items, tanggal, catatan } atau null kalau gagal / tidak terbaca.
  async bacaFoto({ buffer, mimetype, caption = '', mode = 'KELUAR' }) {
    const mediaType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimetype) ? mimetype : 'image/jpeg';
    try {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SISTEM,
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: SKEMA },
        },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
            { type: 'text', text: `Mode: ${mode}\nCaption dari pengirim: ${caption || '(tidak ada)'}` },
          ],
        }],
      });

      if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
      const teks = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const hasil = JSON.parse(teks);
      if (!hasil.terbaca || !hasil.items.length) return null;
      hasil.items = hasil.items.filter((i) => Number.isInteger(i.nominal) && i.nominal > 0);
      return hasil.items.length ? hasil : null;
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        console.error('[AI] API key Claude tidak valid. Periksa ANTHROPIC_API_KEY di file .env');
      } else if (err instanceof Anthropic.RateLimitError) {
        console.error('[AI] Terlalu banyak permintaan, coba lagi nanti');
      } else if (err instanceof Anthropic.APIError) {
        console.error(`[AI] Error API ${err.status}: ${err.message}`);
      } else {
        console.error('[AI] Gagal membaca foto:', err.message);
      }
      return null;
    }
  }
}
