import { prisma } from '../../infrastructure/db/prisma.js';
import { logger } from '../../infrastructure/logger/index.js';
import { createAuditEvent } from '../../modules/audit/helpers.js';
import type { ExecutionReportEvent } from './streamManager.js';

export async function processExecutionReport(report: ExecutionReportEvent): Promise<void> {
  const {
    orderId,
    clientOrderId,
    orderStatus,
    symbol,
    side,
    executedQty,
    cumulativeQuoteQty,
    lastExecutedPrice,
    lastExecutedQty,
    commission,
    commissionAsset,
    eventTime,
    orderType,
  } = report;

  // 1. Find the ExchangeOrder by clientOrderId or exchangeOrderId
  const exchangeOrder = await prisma.exchangeOrder.findFirst({
    where: {
      OR: [
        { clientOrderId },
        { exchangeOrderId: orderId.toString() },
      ],
    },
  });

  if (!exchangeOrder) {
    logger.warn({
      clientOrderId,
      orderId,
      symbol,
      status: orderStatus,
    }, 'Received executionReport for untracked order');
    return;
  }

  // 2. Update the order status
  const executedQtyNum = parseFloat(executedQty);
  const cumulativeQuoteQtyNum = parseFloat(cumulativeQuoteQty);
  const avgPrice = executedQtyNum > 0 ? cumulativeQuoteQtyNum / executedQtyNum : 0;

  await prisma.exchangeOrder.update({
    where: { id: exchangeOrder.id },
    data: {
      status: orderStatus,
      executedQuantity: executedQtyNum as number,
      cumulativeQuoteQuantity: cumulativeQuoteQtyNum as number,
      avgPrice: avgPrice as number,
    },
  });

  // 3. If FILLED or PARTIALLY_FILLED, create ExchangeFill records
  if (orderStatus === 'FILLED' || orderStatus === 'PARTIALLY_FILLED') {
    const fillPrice = parseFloat(lastExecutedPrice);
    const fillQty = parseFloat(lastExecutedQty);
    const fillCommission = parseFloat(commission);
    const fillQuoteQty = fillPrice * fillQty;

    await prisma.exchangeFill.create({
      data: {
        exchangeOrderId: exchangeOrder.id,
        tradeId: `${orderId}_${eventTime}`,
        price: fillPrice as number,
        quantity: fillQty as number,
        quoteQuantity: fillQuoteQty as number,
        commission: fillCommission as number,
        commissionAsset,
        executedAt: new Date(eventTime),
        rawEvent: report as any,
      },
    });

    // 4. If FILLED, update positions
    if (orderStatus === 'FILLED') {
      if (side === 'BUY') {
        // Open or update position
        await prisma.position.upsert({
          where: { id: `${exchangeOrder.strategyId}_${symbol}_${orderId}` },
          create: {
            strategyId: exchangeOrder.strategyId,
            strategyVersionId: exchangeOrder.strategyVersionId ?? '',
            symbol,
            status: 'open',
            source: 'binance_demo',
            entryOrderId: exchangeOrder.id,
            entryPrice: avgPrice as number,
            quantity: executedQtyNum as number,
            investedQuote: cumulativeQuoteQtyNum as number,
            openedAt: new Date(eventTime),
          },
          update: {
            entryPrice: avgPrice as number,
            quantity: executedQtyNum as number,
            investedQuote: cumulativeQuoteQtyNum as number,
          },
        });
      } else if (side === 'SELL') {
        // Close open position for this symbol
        const openPosition = await prisma.position.findFirst({
          where: {
            strategyId: exchangeOrder.strategyId,
            symbol,
            status: 'open',
          },
        });

        if (openPosition) {
          const entryPrice = Number(openPosition.entryPrice ?? 0);
          const investedQuote = Number(openPosition.investedQuote ?? 0);
          const exitValue = cumulativeQuoteQtyNum;
          const realizedPnl = exitValue - investedQuote;
          const realizedPnlPct = investedQuote > 0 ? (realizedPnl / investedQuote) * 100 : 0;

          await prisma.position.update({
            where: { id: openPosition.id },
            data: {
              status: 'closed',
              exitOrderId: exchangeOrder.id,
              exitPrice: avgPrice as number,
              realizedPnl: realizedPnl as number,
              realizedPnlPct: realizedPnlPct as number,
              closedAt: new Date(),
            },
          });
        }
      }
    }
  }

  // 5. Create audit event
  await createAuditEvent({
    actorType: 'system',
    eventType: 'execution_report',
    entityType: 'order',
    entityId: exchangeOrder.id,
    payload: {
      symbol,
      side,
      orderType,
      orderStatus,
      orderId,
      clientOrderId,
      executedQty,
      cumulativeQuoteQty,
      commission,
      commissionAsset,
    },
  });

  logger.info({
    orderId,
    clientOrderId,
    symbol,
    side,
    status: orderStatus,
    executedQty,
  }, 'Execution report processed');
}
