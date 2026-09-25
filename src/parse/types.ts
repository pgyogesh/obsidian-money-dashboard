/** One row of the inbox, exactly as the file holds it. */
export interface InboxRow {
  when: string;
  date: string;
  /** YYYY-MM */
  key: string;
  amount: number;
  direction: string;
  merchant: string;
  category: string;
  account: string;
  method: string;
  ref: string;
  raw: string;
  location: string;
  description: string;
  /** The trimmed line, used to check the row before a write. */
  srcLine: string;
  /** Line index in the whole file, so a write can address the exact line. */
  srcIndex: number;
  /** Columns in the header the row was read with. A row may have fewer. */
  width?: number;
  catCol?: number;
  descCol?: number;
  merCol?: number;
}

/** A transaction in the shape every page works with. Positive is money out. */
export interface Txn {
  /** Full timestamp when there is one, so the table sorts within a day. */
  date: string;
  /** The original SMS or statement text. */
  desc: string;
  merchant: string;
  category: string;
  /** The account holder's own words. */
  description: string;
  /** Account or card name. */
  card: string;
  /** Payment method. */
  type: string;
  amount: number;
  /** Bank reference, or a legacy Notes value. Searched, never a duplicate key. */
  note: string;
  /** The bank reference alone. Archiving uses it as the duplicate key. */
  ref?: string;
  location: string;
  /** The inbox row behind this transaction. Absent for an archived row. */
  src?: InboxRow;
}

/** The category names that are not spend. Compared without case. */
export interface Categories {
  income: string;
  transfer: string;
  investments: string;
}

export type Ranked = [string, number][];

export interface Summary {
  txns: Txn[];
  spendT: Txn[];
  income: number;
  invested: number;
  spend: number;
  refunds: number;
  net: number;
  count: number;
  refundCount: number;
  transfers: number;
  transferCount: number;
  byCategory: Ranked;
  byCard: Ranked;
  byType: Ranked;
  byMerchant: [string, { total: number; count: number }][];
  tableless?: boolean;
}
