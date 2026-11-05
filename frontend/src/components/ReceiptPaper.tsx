import { encodeInvoiceBarcode, layoutReceiptBarcode, layoutReceiptTable, RECEIPT_CURRENCY, RECEIPT_DPI } from '../utils/receiptLayout';
import type { ReceiptModel, ReceiptPaperWidth, ReceiptRow } from '../utils/receiptLayout';

interface ReceiptPaperProps {
  model: ReceiptModel;
  paper: ReceiptPaperWidth;
  logoUrl?: string | null;
  id?: string;
}

// The paper simulation is always black on white (it mimics thermal paper), independent of the app theme.
function Rows({ rows, small = false }: { rows: ReceiptRow[]; small?: boolean }) {
  return (
    <>
      {rows.map((row, index) => (
        <div
          key={`${row.label}-${index}`}
          className={`flex flex-wrap items-baseline justify-between gap-x-2 ${row.emphasis ? 'font-bold' : ''} ${small ? 'text-micro' : ''}`}
        >
          <span className="break-words">{row.label}</span>
          <span dir="ltr" className="font-mono tabular-nums">{row.value}</span>
        </div>
      ))}
    </>
  );
}

// The real invoice barcode (Code 128) at its printed physical size: whole-dot modules, no digits underneath (the invoice number is in the header), always black on white.
function InvoiceBarcode({ value, paper }: { value: string; paper: ReceiptPaperWidth }) {
  const bits = encodeInvoiceBarcode(value);
  if (!bits) return null;
  const layout = layoutReceiptBarcode(bits.length, paper);
  const mm = (dots: number) => `${((dots * 25.4) / RECEIPT_DPI).toFixed(2)}mm`;
  const bars: Array<{ x: number; width: number }> = [];
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    let run = 1;
    while (bits[i + run] === '1') run++;
    bars.push({ x: i, width: run });
    i += run - 1;
  }
  return (
    <div className="mt-1 text-center">
      <svg
        role="img"
        aria-label={`باركود الفاتورة ${value}`}
        className="block mx-auto"
        style={{ width: mm(layout.widthDots), height: mm(layout.heightDots) }}
        viewBox={`0 0 ${bits.length} 1`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
      >
        {bars.map((bar) => (
          <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={1} fill="currentColor" />
        ))}
      </svg>
    </div>
  );
}

export function ReceiptPaper({ model, paper, logoUrl, id }: ReceiptPaperProps) {
  const is57mm = paper === '57mm';
  const table = layoutReceiptTable(model.lines, paper);
  const numbersGrid = 'grid gap-x-2 justify-start font-mono tabular-nums shrink-0';
  const numbersStyle = { gridTemplateColumns: `${table.qtyChars}ch ${table.priceChars}ch ${table.totalChars}ch` };

  return (
    <div
      id={id}
      className={`${is57mm ? 'w-[220px] px-2.5 py-2 text-micro' : 'w-[302px] px-4 py-2 text-micro'} bg-white text-black font-sans leading-relaxed shadow-sm select-text border border-line transition-all duration-200`}
      dir="rtl"
    >
      {/* Store header */}
      {logoUrl && (
        <div className="flex justify-center mb-1.5">
          <img
            src={logoUrl}
            alt="شعار المتجر"
            className={`object-contain max-h-[48px] ${is57mm ? 'max-w-[90px]' : 'max-w-[130px]'}`}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/receipt_logo_square.png';
            }}
          />
        </div>
      )}
      <div className={`text-center font-bold break-words ${is57mm ? 'text-sm' : 'text-base'}`}>{model.storeName}</div>
      {model.address && <div className="text-center text-micro break-words">{model.address}</div>}
      {model.phone && <div className="text-center text-micro break-words">هاتف: {model.phone}</div>}
      {model.taxNumber && <div className="text-center text-micro break-words">الرقم الضريبي: {model.taxNumber}</div>}
      {model.headerLines.length > 0 && (
        <div className="text-center text-micro mt-1">
          {model.headerLines.map((line, i) => (
            <div key={i} className="break-words min-h-[1em]">{line}</div>
          ))}
        </div>
      )}

      <div className="border-t border-dashed border-black my-1.5"></div>

      {/* Invoice number + date/time, cashier, order meta, customer */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold break-words">{model.invoiceLabel}</span>
        <span dir="ltr" className="text-micro font-mono tabular-nums whitespace-nowrap">{model.dateTime}</span>
      </div>
      {model.cashier && <div className="text-micro break-words">{model.cashier}</div>}
      {model.orderMeta && <div className="text-micro break-words">{model.orderMeta}</div>}
      {model.customer && <div className="text-micro break-words">{model.customer}</div>}

      {model.badges.map((badge) => (
        <div key={badge} className="bg-black text-white text-center font-bold py-0.5 my-1 mx-2">{badge}</div>
      ))}

      <div className="border-t border-dashed border-black my-1.5"></div>

      {/* Items: name takes its own full-width line when long; numbers sit on the left (qty | price | total) */}
      {model.lines.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-2 font-bold border-b-2 border-black pb-0.5 mb-1">
            <span>الصنف</span>
            {table.columns ? (
              <span className={numbersGrid} style={numbersStyle}>
                <span>الكمية</span>
                <span className="text-right" dir="ltr">السعر</span>
                <span className="text-right" dir="ltr">الإجمالي</span>
              </span>
            ) : (
              <span className="flex gap-2">
                <span>الكمية × السعر</span>
                <span>الإجمالي</span>
              </span>
            )}
          </div>

          <div className="space-y-1">
            {model.lines.map((line, index) => (
              <div key={index}>
                {table.columns && table.inline[index] ? (
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-bold whitespace-nowrap shrink-0">{line.name}</span>
                    <span className={numbersGrid} style={numbersStyle}>
                      <span dir="rtl">{line.qty}</span>
                      <span dir="ltr" className="text-right">{line.price}</span>
                      <span dir="ltr" className="text-right font-bold">{line.total}</span>
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="font-bold break-words">{line.name}</div>
                    {table.columns ? (
                      <div className="flex justify-end">
                        <span className={numbersGrid} style={numbersStyle}>
                          <span dir="rtl">{line.qty}</span>
                          <span dir="ltr" className="text-right">{line.price}</span>
                          <span dir="ltr" className="text-right font-bold">{line.total}</span>
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span dir="rtl" className="font-mono tabular-nums">{line.qty} × {line.price}</span>
                        <span dir="ltr" className="font-mono tabular-nums font-bold">{line.total}</span>
                      </div>
                    )}
                  </>
                )}
                {line.details.map((detail, detailIndex) => (
                  <div key={detailIndex} className="text-micro pr-2 break-words">{detail}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals: pre-discount subtotal, ONE total discount row and fees (only when there is something to show) */}
      {model.adjustmentRows.length > 0 && (
        <>
          <div className="border-t border-dashed border-black my-1.5"></div>
          <div className="space-y-0.5">
            <Rows rows={model.adjustmentRows} />
          </div>
        </>
      )}

      <div className="border-t-2 border-black my-1.5"></div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-bold">الإجمالي النهائي</span>
        <span dir="ltr" className={`font-mono font-bold tabular-nums ${is57mm ? 'text-sm' : 'text-base'}`}>
          {model.grandTotal} {RECEIPT_CURRENCY}
        </span>
      </div>
      {model.taxText && (
        <div className="flex justify-between text-micro">
          <span>منها ضريبة القيمة المضافة</span>
          <span dir="ltr" className="font-mono tabular-nums">{model.taxText}</span>
        </div>
      )}
      {model.epayFeeText && (
        <>
          <div className="flex justify-between">
            <span>رسوم خدمة الدفع الإلكتروني</span>
            <span dir="ltr" className="font-mono tabular-nums">{model.epayFeeText}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>المطلوب سداده</span>
            <span dir="ltr" className="font-mono tabular-nums">{model.payableText}</span>
          </div>
        </>
      )}

      {/* Payments: only the methods used, change and the credit remainder */}
      {model.paymentRows.length > 0 && (
        <>
          <div className="border-t border-dashed border-black my-1.5"></div>
          <div className="space-y-0.5">
            <Rows rows={model.paymentRows} />
          </div>
        </>
      )}

      {/* Delivery slip */}
      {model.deliveryTitle && (
        <>
          <div className="border-t-2 border-black my-1.5"></div>
          <div className="font-bold break-words">{model.deliveryTitle}</div>
          {model.deliveryLines.map((line) => (
            <div key={line} className="text-micro break-words">{line}</div>
          ))}
        </>
      )}

      {model.barcode && <InvoiceBarcode value={model.barcode.value} paper={paper} />}

      <div className="border-t border-dashed border-black my-1.5"></div>
      {model.coldChainNotice && <div className="text-center font-bold break-words mb-0.5">{model.coldChainNotice}</div>}
      {model.notes && <div className="text-center text-micro break-words mb-0.5">{model.notes}</div>}
      {model.footerLines.length > 0 && (
        <div className="text-center text-micro">
          {model.footerLines.map((line, i) => (
            <div key={i} className="break-words min-h-[1em]">{line}</div>
          ))}
        </div>
      )}

      {model.signatureVisible && (
        <div className={`${model.footerBlock ? 'border-t border-dashed border-black mt-1.5 pt-1 ' : ''}text-center text-micro`}>
          {model.signatureImageSrc && (
            // One line below the dashed separator, like the thermal print; always black on white, never recoloured.
            // The height cap matches the printer (about 4.5 small lines) so a tall custom image cannot stretch the receipt.
            <img
              src={model.signatureImageSrc}
              alt=""
              className="block mx-auto mt-4 mb-1 w-2/3 max-w-full max-h-14 h-auto object-contain"
            />
          )}
          {model.signatureLines.map((line, i) => (
            <div key={i} className="break-words min-h-[1em]">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
