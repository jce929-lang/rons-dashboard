import { google, sheets_v4 } from "googleapis";

type Client = sheets_v4.Sheets;

let cached: Client | null = null;

function getClient(): Client {
  if (cached) return cached;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY. See SETUP.md."
    );
  }
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cached = google.sheets({ version: "v4", auth });
  return cached;
}

function sheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("Missing GOOGLE_SHEET_ID. See SETUP.md.");
  return id;
}

export async function readRange(range: string): Promise<string[][]> {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range,
  });
  return (res.data.values as string[][]) ?? [];
}

export async function writeRange(range: string, values: (string | number | null)[][]): Promise<void> {
  const sheets = getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

export async function appendRow(range: string, values: (string | number | null)[]): Promise<void> {
  const sheets = getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId(),
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}

/** Parse a 2D range into objects keyed by the header row. */
export function rowsToObjects<T extends Record<string, string>>(rows: string[][]): T[] {
  if (rows.length < 2) return [];
  const [header, ...body] = rows;
  return body.map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => {
      o[h] = r[i] ?? "";
    });
    return o as T;
  });
}

/**
 * Make sure a tab exists. If it doesn't, create it and fill it with `initialRows`.
 * Returns true if the tab was just created.
 */
export async function ensureSheet(title: string, initialRows: (string | number)[][]): Promise<boolean> {
  const sheets = getClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: sheetId(),
    fields: "sheets.properties.title",
  });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === title);
  if (exists) return false;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId(),
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: { title, gridProperties: { frozenRowCount: 1 } },
          },
        },
      ],
    },
  });
  if (initialRows.length > 0) await writeRange(`${title}!A1`, initialRows);
  return true;
}

/** Write several ranges in one call. */
export async function batchWrite(data: { range: string; values: (string | number | null)[][] }[]): Promise<void> {
  if (data.length === 0) return;
  const sheets = getClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId(),
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

/** Append many rows in one call. */
export async function appendRows(range: string, values: (string | number | null)[][]): Promise<void> {
  if (values.length === 0) return;
  const sheets = getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId(),
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

/** Clear the values in a range (formatting is kept). */
export async function clearRange(range: string): Promise<void> {
  const sheets = getClient();
  await sheets.spreadsheets.values.clear({ spreadsheetId: sheetId(), range });
}
