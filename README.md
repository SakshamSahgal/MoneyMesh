# Moneymesh

Moneymesh is a personal finance visualizer that runs entirely in the browser. You point it at a folder of bank statement Excel files and it builds a Sankey flow diagram showing exactly where your money came from and where it went — across one month or several.

The left side of the diagram shows your income broken down by source (salary, interest, cash deposits, refunds, bank transfers). The right side shows your spending broken down by category (food, shopping, transport, health, subscriptions, investments, etc.). Opening and closing balances are included on either side so the flow always adds up.

**Features:**

- Reads `.xlsx` bank statements from multiple banks at once, each in their own folder
- Automatically detects the month from transaction dates, not filenames
- Date range slider to filter by any custom period across your data
- Per-bank filter to isolate a single bank's transactions
- Summary cards at the top showing opening balance, total income, total expenses, net savings, and closing balance — click any card to see how the number is calculated
- Click any node on the diagram to see all transactions behind it, grouped by the keyword that matched them
- Category rules are defined in a plain `rules.json` file — no code changes needed to add or rename categories
- Everything runs client-side, no data leaves your machine

---

## What you need

- Your bank statements exported as `.xlsx` files, organized like this:

```
Statements/
  BankOne/
    Transactions.xlsx
  BankTwo/
    Transactions.xlsx
```

- A `rules.json` file that defines which keywords map to which categories. A default one is included in the repo.

---

## Running locally

Because the app uses a file picker to read your statements, it works fine by just opening `index.html` directly in a browser — no server needed.

## Usage

1. Click **Load Rules JSON** and select your `rules.json` file.
2. Click **Select Statements Folder** and select your `Statements` folder.
3. Use the date range slider and bank filter to narrow down the view.
4. Click any node or summary card for a breakdown.

---

## Customizing categories

`rules.json` is fully customizable. You can edit existing categories, add your own, or define new income sources — all without touching any code.

The file has two sections: `expenseRules` for spending categories and `incomeRules` for income sources. Each entry has a `category` (or `source`) name and a list of `keywords`. When a transaction description contains any of those keywords, it gets assigned to that category.

```json
{
  "expenseRules": [
    {
      "category": "Rent",
      "keywords": ["rent", "landlord", "housing society", "maintenance charge"]
    }
  ],
  "incomeRules": [
    {
      "source": "Rental Income",
      "keywords": ["rent received", "tenant payment"]
    }
  ]
}
```

A few things to keep in mind:

- Keywords are matched case-insensitively, so write them in lowercase
- The first matching rule wins, so put more specific keywords before generic ones
- If no keyword matches, the transaction falls into **Others** or **Other Income**
