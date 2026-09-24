# Shortcut prompt

This is the prompt the Apple Shortcut sends to a language model with each bank SMS. The model returns one inbox row.

Before you use it:

1. Copy everything inside the fence below into a note in your vault, for example `ExpensePrompt.md`.
2. Replace every `<...>` placeholder with your own name, accounts and merchant spellings.
3. Keep the category list in step with the category list in the plugin settings.
4. In the Shortcut, read the note with a **Get file** action, then append three labelled lines to it: `When:` (the date from **Format Date**, `yyyy-MM-dd HH:mm`), `Location:` (a Maps link, or nothing) and `Message:` (the SMS).

Your name is used only so the model can tell a transfer between your own accounts from a payment to someone else.

```text
Convert this bank SMS into ONE markdown table row.

Output ONLY the row. Start and end with a pipe character. No header row, no
explanation, no code fence.

The account holder is <YOUR FULL NAME>. Use this only to tell the
holder's own accounts apart from an outside party: money moving between the
holder's own accounts, or a credit card bill payment made from the bank
account, is a Transfer, not spend.

The row has 11 cells in this order:
| When | Amount | Direction | Merchant | Category | Account | Method | Ref | Location | Raw | Description |
Output all 11 cells every time. If a cell has no value, leave it empty but
  keep its pipes, so the columns never shift.

Three labelled lines follow this instruction:

  When: copy this text exactly: <the date>
  Location: copy this text exactly: <a markdown link, or nothing>
  Message: <the SMS text>

Take When and Location from those lines exactly as given. The SMS to convert
  is the text after Message: and nothing else. If a label has nothing after
  it, treat that value as absent and leave its cell empty. Never copy the
  words "copy this text exactly" into any cell.

Fill them as follows. The rules below are in the SAME order as the cells, and
  the cells must come out in that order whatever order you work them out in.

When: copy the supplied date and time exactly as it is given to you. Do not
  reformat it, do not shift it, and never write a date from your own
  knowledge. You do not know the current date or time. If no date is
  supplied, leave the cell empty rather than guessing.
Amount: digits and at most one dot. Two decimals. No currency symbol, no
  commas, no minus sign. Example: 1234.50
Direction: debit if money left the account. credit if money came in. If the
  message does not make this clear, write unknown.
  Read it from YOUR side. An EMI or a bill that a lender says "is received" or
  "credited to your loan account" is money OUT of your account, so it is a
  debit, not a credit.
Merchant: the other party's name as the message gives it. If there is none,
  write unknown.
Category: leave this cell EMPTY unless the merchant name makes the category
  obvious. Only when it is obvious, use exactly one of:
  Rent & Home, Farm, Groceries, Dining & Delivery, Transport & Fuel,
  Bills & Utilities, Shopping, Health & Medical, Fitness, Personal Care,
  Entertainment & Subscriptions, Festival & Celebration,
  Travel, Education, Insurance, Loan & EMI, Investments,
  Family & Gifts, Cash Withdrawal, Fees & Interest, Taxes, Income, Transfer
  A payment to a person's name is never obvious. Leave it empty.
  An EMI, an instalment, a loan account number or a lender is Loan & EMI. A credit card
  bill payment is Transfer, not Loan & EMI.
  A sweet shop, a decorator, a caterer, a mandap or a fireworks seller is
  Festival & Celebration.
  An SIP, a mutual fund, an ELSS, NPS, PPF, an RD or a broker is
  Investments.
  An ATM withdrawal is Cash Withdrawal. A pharmacy or hospital is
  Health & Medical. A salon, barber or spa is Personal Care.
  A fuel station is Transport & Fuel, unless the fuel is clearly for the
  farm. Seeds, fertiliser, pesticide and farm labour are Farm, but a farm
  payment usually looks like a payment to a person, so leave it empty
  unless the merchant name itself says so. When in any doubt,
  leave it empty. An empty cell is correct. A wrong guess is not.
%% money:merchants:start %%
Merchant names, agreed spellings. If the message clearly names one of
  these, write it EXACTLY as spelled here, whatever the SMS shouted or
  truncated. This is what keeps one shop from becoming three rows.

  <Merchant spelling>  (also seen as: <SMS SPELLING>, <TRUNCATED SPELLING>)
  <Merchant spelling>

  Only for a merchant in this list. For anything else, copy the name as
  the message gives it. Never guess at a longer name, and never expand a
  person's truncated name.
%% money:merchants:end %%
Account: exactly one of these, copied character for character:
  <Bank account name>
  <Credit card name>
  <Wallet name>
  If none of them matches, write unknown.
Method: exactly one of these nine, lowercase, exactly as spelled here:
  upi, credit_card, debit_card, neft, imps, netbanking, atm, fastag, cash
  Never write an account name here. Work through these in order:
    If the account is one of your credit cards, write credit_card.
    If the account is a toll wallet, write fastag.
    If the message mentions UPI, a VPA or an @ handle, write upi.
    If it mentions NEFT, write neft. If it mentions IMPS, write imps.
    If it mentions ATM or a cash withdrawal, write atm.
    If it mentions a debit card or a POS terminal, write debit_card.
    If it mentions net banking or internet banking, write netbanking.
    Only if none of these apply, write unknown.
Ref: the reference number, UTR, RRN, transaction id or reference id from the
  message. Look for it after words like Ref, Ref No, RRN, UTR, txn id or
  Info. Copy the digits and letters only, with no label and no spaces.
  This is what stops the same transaction being counted twice, so include it
  whenever the message carries one. Leave it empty only if there is none.
Location: copy the supplied location link exactly as it is given to you,
  including its square brackets and round brackets. It looks like
  [Street, Town/City, County](https://maps.apple.com/...). Parts of the
  label are often missing, so it may begin with a comma, as in
  [, Pune, Maharashtra](...). Copy it as it is anyway. Do not tidy the
  commas, do not shorten the URL, and do not drop the brackets.
  If nothing is supplied, leave the cell empty. Never invent a place name,
  an address or coordinates, and never take a place from the SMS text.
Raw: the whole Message: value, not just its first line, with every |
  replaced by / and every line break replaced by a single space. Include
  only the SMS text. Never include the When: or Location: lines, and never
  include their labels.
Description: leave this cell EMPTY. It is what the money was actually for, in
  the account holder's own words, and a bank SMS almost never says. Write
  something ONLY if the message itself states the purpose in plain words,
  such as an electricity bill, a gas booking or a policy premium. A merchant
  name is not a purpose, so never copy the merchant here. An empty cell is
  correct and expected: it is filled in by hand later.

In EVERY cell, never write a | character. Replace it with / . A single stray
  pipe adds a column and silently shifts every value after it into the wrong
  field. This applies to Merchant and Location as much as to Raw.

If the message is not a completed transaction, output nothing at all. An OTP,
  a balance alert, a due-date reminder, a limit warning, a failed or declined
  payment, an offer or any promotion is not a transaction. Silence is correct.
  Do not invent a row for it.
  An ADVANCE NOTICE is not a transaction either. "will be auto-debited",
  "will be debited on", "please ensure sufficient balance" and an AutoPay
  or mandate reminder all describe money that has NOT moved yet. The real
  debit arrives as its own message later, so writing a row now would count
  the same rupee twice.
```
