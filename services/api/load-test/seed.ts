/**
 * Seed de carga: 30 dias de uso realista
 *
 * Simula:
 *   - 1 usuário
 *   - 5 recargas PIX por dia (30 dias = 150 pagamentos)
 *   - 1 sessão por dia de 30 min (30 sessões)
 *   - Mês de referência: 2026-03 (dias 1–30)
 *
 * Como rodar:
 *   cd services/api
 *   npx ts-node ../../load-test/seed.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_PHONE = '+5511900000001';
const YEAR = 2026;
const MONTH = 3; // março
const DAYS = 30;
const PAYMENTS_PER_DAY = 5;

// Mix realista de pacotes (mesmo que PACKAGES do shared)
const PACKAGES = [
  { price_cents: 6000, balance_seconds: 3600 }, // R$60 – 60min  (50%)
  { price_cents: 4000, balance_seconds: 2100 }, // R$40 – 35min  (30%)
  { price_cents: 2000, balance_seconds: 900  }, // R$20 – 15min  (15%)
  { price_cents: 1000, balance_seconds: 300  }, // R$10 –  5min  ( 5%)
];

function pickPackage(idx: number) {
  const r = idx % 20;
  if (r < 10) return PACKAGES[0];
  if (r < 16) return PACKAGES[1];
  if (r < 19) return PACKAGES[2];
  return PACKAGES[3];
}

async function main() {
  // Limpa dados anteriores do teste
  console.log('Limpando dados anteriores de teste...');
  const existing = await prisma.user.findUnique({ where: { phone: TEST_PHONE } });
  if (existing) {
    await prisma.session.deleteMany({ where: { user_id: existing.id } });
    await prisma.payment.deleteMany({ where: { user_id: existing.id } });
    await prisma.otpCode.deleteMany({ where: { phone: TEST_PHONE } });
    await prisma.user.delete({ where: { id: existing.id } });
    console.log('  Dados anteriores removidos.');
  }

  // Cria o usuário de teste
  const user = await prisma.user.create({
    data: {
      phone: TEST_PHONE,
      name: 'Teste Carga 30 Dias',
      balance_seconds: 0,
    },
  });
  console.log(`Usuário criado: ${user.id}`);

  let totalCredited = 0;
  let paymentIdx = 0;

  console.log(`Criando ${DAYS * PAYMENTS_PER_DAY} pagamentos e ${DAYS} sessões...`);

  for (let day = 1; day <= DAYS; day++) {
    // 5 recargas distribuídas ao longo do dia (9h, 11h, 13h, 15h, 17h)
    for (let p = 0; p < PAYMENTS_PER_DAY; p++) {
      const pkg = pickPackage(paymentIdx++);
      const createdAt = new Date(Date.UTC(YEAR, MONTH - 1, day, 9 + p * 2, p * 7, 0));

      await prisma.payment.create({
        data: {
          user_id: user.id,
          amount_cents: pkg.price_cents,
          balance_seconds: pkg.balance_seconds,
          source: 'pix',
          status: 'paid',
          // abacatepay_id precisa ser único (campo @unique no schema)
          abacatepay_id: `lt_d${String(day).padStart(2,'0')}_p${p}_${Math.random().toString(36).slice(2,9)}`,
          created_at: createdAt,
        },
      });
      totalCredited += pkg.balance_seconds;
    }

    // 1 sessão por dia: 30 min a partir das 14h
    const sessionStart = new Date(Date.UTC(YEAR, MONTH - 1, day, 14, 0, 0));
    const sessionEnd   = new Date(Date.UTC(YEAR, MONTH - 1, day, 14, 30, 0));

    await prisma.session.create({
      data: {
        user_id: user.id,
        started_at: sessionStart,
        ended_at: sessionEnd,
        duration_seconds: 1800,
        cost_cents: 0,
      },
    });

    if (day % 5 === 0) console.log(`  Dia ${day}/${DAYS} concluído`);
  }

  const totalUsed = DAYS * 1800; // 30 min/dia
  const finalBalance = Math.max(0, totalCredited - totalUsed);

  await prisma.user.update({
    where: { id: user.id },
    data: { balance_seconds: finalBalance },
  });

  console.log('\n=== Seed concluído ===');
  console.log(`  Usuário      : ${TEST_PHONE}`);
  console.log(`  Pagamentos   : ${DAYS * PAYMENTS_PER_DAY}`);
  console.log(`  Sessões      : ${DAYS}`);
  console.log(`  Crédito total: ${totalCredited}s (${(totalCredited / 3600).toFixed(1)}h)`);
  console.log(`  Usado total  : ${totalUsed}s`);
  console.log(`  Saldo final  : ${finalBalance}s`);
  console.log('\nUse o mês 2026-03 no relatório financeiro.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
