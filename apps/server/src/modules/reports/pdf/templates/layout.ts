// Shared page frame for every report template: title block, generated-by line, page numbers.
export type Cell = string | number | { text: string; style?: string; colSpan?: number };

export const styles = {
  title: { fontSize: 16, bold: true, margin: [0, 0, 0, 2] },
  subtitle: { fontSize: 9, color: "#555555", margin: [0, 0, 0, 12] },
  section: { fontSize: 11, bold: true, margin: [0, 12, 0, 6] },
  th: { bold: true, fontSize: 8, fillColor: "#eeeeee" },
  muted: { color: "#666666" },
};

export function frame(input: {
  title: string;
  subtitle: string;
  generatedBy: string;
  generatedAt: Date;
  content: object[];
  landscape?: boolean;
  /** Small square image (data URL) printed beside the title. */
  photo?: string | null;
}) {
  const heading = [
    { text: input.title, style: "title" },
    { text: input.subtitle, style: "subtitle" },
  ];
  return {
    info: { title: input.title, creator: "Alumni Tracking System" },
    pageSize: "A4",
    pageOrientation: input.landscape ? "landscape" : "portrait",
    pageMargins: [36, 40, 36, 44],
    defaultStyle: { font: "Roboto", fontSize: 9 },
    styles,
    content: [
      ...(input.photo
        ? [
            {
              columns: [
                { image: input.photo, width: 64, height: 64 },
                { stack: heading, margin: [0, 14, 0, 0] },
              ],
              columnGap: 12,
            },
          ]
        : heading),
      ...input.content,
    ],
    footer: (current: number, total: number) => ({
      columns: [
        {
          text: `Generated ${input.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC by ${input.generatedBy} · Confidential`,
          style: "muted",
          fontSize: 7,
        },
        { text: `Page ${current} of ${total}`, alignment: "right", fontSize: 7, style: "muted" },
      ],
      margin: [36, 12, 36, 0],
    }),
  };
}

export function table(headers: string[], rows: Cell[][], widths?: (string | number)[]) {
  return {
    table: {
      headerRows: 1,
      widths: widths ?? headers.map(() => "*"),
      body: [
        headers.map((text) => ({ text, style: "th" })),
        ...(rows.length
          ? rows
          : [
              [
                { text: "No records.", colSpan: headers.length, style: "muted" },
                ...headers.slice(1).map(() => ""),
              ],
            ]),
      ],
    },
    layout: "lightHorizontalLines",
  };
}

export const text = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);
