import type { ConvertedLabel } from '../zpl-parser'

// Este componente só desenha o modelo convertido; quem interpreta ZPL é o parser.
export function ReadSVG({ label }: { label: ConvertedLabel }) {
  return (
    <svg
      className="label-svg"
      viewBox={`0 0 ${label.width} ${label.height}`}
      width={label.width}
      height={label.height}
      role="img"
      aria-label={`Prévia SVG da etiqueta, ${label.width} por ${label.height} pontos`}
      data-export-label=""
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <title>Prévia da etiqueta convertida de ZPL para SVG</title>
      <rect width={label.width} height={label.height} fill="#ffffff" />
      {label.elements.map((element, index) => {
        if (element.type === 'rectangle') {
          return (
            <rect
              key={`shape-${index}`}
              x={element.x}
              y={element.y}
              width={element.width}
              height={element.height}
              fill={element.fill}
              stroke={element.stroke}
              strokeWidth={element.strokeWidth}
            />
          )
        }

        if (element.type === 'graphic') {
          return (
            <image
              key={`graphic-${index}`}
              x={element.x}
              y={element.y}
              width={element.width}
              height={element.height}
              href={element.href}
              preserveAspectRatio="none"
            />
          )
        }

        if (element.type === 'barcode') {
          return (
            <g key={`barcode-${index}`}>
              {element.bars.map((bar, barIndex) => (
                <rect
                  key={`bar-${barIndex}`}
                  x={element.x + bar.x}
                  y={element.y}
                  width={bar.width}
                  height={element.height}
                  fill={element.fill}
                />
              ))}
              <text
                x={element.x + element.width / 2}
                y={element.y + element.height + 24}
                fill={element.fill}
                fontFamily="Arial, Helvetica, sans-serif"
                fontSize={20}
                textAnchor="middle"
              >
                {element.value}
              </text>
            </g>
          )
        }

        if (element.type === 'qrcode') {
          // A borda branca ao redor do QR é necessária para leitores de câmera.
          const quietZone = element.quietZoneModules * element.moduleSize

          return (
            <g key={`qrcode-${index}`} shapeRendering="crispEdges">
              <rect
                x={element.x}
                y={element.y}
                width={element.size}
                height={element.size}
                fill="#ffffff"
              />
              {element.modules.flatMap((row, rowIndex) =>
                row.map((isDark, columnIndex) =>
                  isDark ? (
                    <rect
                      key={`${rowIndex}-${columnIndex}`}
                      x={element.x + quietZone + columnIndex * element.moduleSize}
                      y={element.y + quietZone + rowIndex * element.moduleSize}
                      width={element.moduleSize}
                      height={element.moduleSize}
                      fill={element.fill}
                    />
                  ) : null,
                ),
              )}
            </g>
          )
        }

        return (
          <text
            key={`text-${index}`}
            x={element.x}
            y={element.y}
            fill={element.fill}
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize={element.size}
            textAnchor={element.anchor ?? 'start'}
          >
            {element.value}
          </text>
        )
      })}
    </svg>
  )
}
