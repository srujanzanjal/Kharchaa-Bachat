"use server";

import { DEFAULT_HOUSEHOLD_ID, getDb } from "@/lib/server/db";
import { formatPaise } from "@/lib/money";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type AsyncData,
  type CategorySpending,
  type ExpenseCategory,
  type ExpenseOwner,
  type MonthlyAward,
  type MonthlyRecapData,
} from "@/types";

const DB_UNAVAILABLE_MESSAGE = "We can\u2019t reach your data right now.";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getMonthDateRange(year: number, month: number) {
  const startMonthStr = String(month).padStart(2, "0");
  const startIso = `${year}-${startMonthStr}-01T00:00:00+05:30`;

  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const endMonthStr = String(nextMonth).padStart(2, "0");
  const endIso = `${nextYear}-${endMonthStr}-01T00:00:00+05:30`;

  return { startIso, endIso };
}

/**
 * Derives comprehensive Monthly Recap and Awards server-side for a specific month.
 * Strictly scoped to the private household with integer paise precision.
 */
export async function fetchMonthlyRecap(
  year: number,
  month: number
): Promise<AsyncData<MonthlyRecapData>> {
  try {
    // 1. Strict input validation
    if (
      !Number.isInteger(year) ||
      year < 2020 ||
      year > 2050 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return {
        status: "error",
        data: null,
        error: "Invalid calendar period specified.",
      };
    }

    const { startIso, endIso } = getMonthDateRange(year, month);
    const monthName = MONTH_NAMES[month - 1];

    const db = getDb();
    const result = await db.query(
      `SELECT 
        id,
        total_amount_paise,
        owner,
        category,
        srujan_amount_paise,
        disha_amount_paise,
        note,
        created_at
       FROM expenses
       WHERE household_id = $1
         AND created_at >= $2::timestamptz
         AND created_at < $3::timestamptz
       ORDER BY total_amount_paise DESC, created_at DESC;`,
      [DEFAULT_HOUSEHOLD_ID, startIso, endIso]
    );

    const rows = result.rows || [];

    // 2. Handle empty month
    if (rows.length === 0) {
      return {
        status: "success",
        data: {
          year,
          month,
          month_name: monthName,
          total_spent_paise: 0,
          expense_count: 0,
          average_expense_paise: 0,
          largest_expense: null,
          largest_category: null,
          categories: [],
          awards: [],
          headline: "Nothing spent yet.",
          subheadline: `Your wallet had a quiet month in ${monthName} ${year}.`,
          srujan_total_paise: 0,
          disha_total_paise: 0,
        },
      };
    }

    // 3. Compute totals (integer paise)
    let totalSpentPaise = 0;
    let srujanTotalPaise = 0;
    let dishaTotalPaise = 0;
    let sharedCount = 0;

    for (const r of rows) {
      totalSpentPaise += Number(r.total_amount_paise);
      srujanTotalPaise += Number(r.srujan_amount_paise);
      dishaTotalPaise += Number(r.disha_amount_paise);
      if (r.owner === "both") {
        sharedCount += 1;
      }
    }

    const expenseCount = rows.length;
    const averageExpensePaise =
      expenseCount > 0 ? Math.round(totalSpentPaise / expenseCount) : 0;

    // 4. Largest single expense (rows already sorted by total_amount_paise DESC)
    const topRow = rows[0];
    const largestExpense = {
      id: topRow.id,
      total_amount_paise: Number(topRow.total_amount_paise),
      owner: topRow.owner as ExpenseOwner,
      category: (topRow.category as ExpenseCategory) || "other",
      note: topRow.note || null,
      created_at:
        topRow.created_at instanceof Date
          ? topRow.created_at.toISOString()
          : String(topRow.created_at),
    };

    // 5. Category breakdown
    const categorySpendingMap = new Map<
      ExpenseCategory,
      { totalPaise: number; count: number }
    >();

    for (const r of rows) {
      const cat = (r.category as ExpenseCategory) || "other";
      const current = categorySpendingMap.get(cat) || { totalPaise: 0, count: 0 };
      current.totalPaise += Number(r.total_amount_paise);
      current.count += 1;
      categorySpendingMap.set(cat, current);
    }

    const categories: CategorySpending[] = EXPENSE_CATEGORIES.map((cat) => {
      const stats = categorySpendingMap.get(cat) || { totalPaise: 0, count: 0 };
      const percentage =
        totalSpentPaise > 0
          ? Math.round((stats.totalPaise * 100) / totalSpentPaise)
          : 0;

      return {
        category: cat,
        label: EXPENSE_CATEGORY_LABELS[cat] || cat,
        total_paise: stats.totalPaise,
        percentage,
        expense_count: stats.count,
      };
    })
      .filter((c) => c.total_paise > 0)
      .sort((a, b) => b.total_paise - a.total_paise);

    const largestCategory =
      categories.length > 0
        ? {
            category: categories[0].category,
            label: categories[0].label,
            total_paise: categories[0].total_paise,
            percentage: categories[0].percentage,
          }
        : null;

    // 6. Deterministic Awards (2 to 4 awards maximum)
    const awards: MonthlyAward[] = [];

    // Award 1: Biggest Splurge
    if (largestExpense && largestExpense.total_amount_paise > 0) {
      const itemTitle = largestExpense.note
        ? largestExpense.note
        : `${EXPENSE_CATEGORY_LABELS[largestExpense.category]} (${formatPaise(
            largestExpense.total_amount_paise
          )})`;
      awards.push({
        id: "biggest_splurge",
        title: "Biggest Splurge",
        icon: "🏆",
        recipient: itemTitle,
        detail: `Single largest expense of the month at ${formatPaise(
          largestExpense.total_amount_paise
        )}.`,
      });
    }

    // Award 2: Category Champion
    if (largestCategory) {
      if (largestCategory.category === "coffee_tea") {
        awards.push({
          id: "coffee_champion",
          title: "Coffee Champion",
          icon: "☕",
          recipient: "Coffee & Tea",
          detail: `${largestCategory.percentage}% of all spending went to brews, chai, and cafe runs.`,
        });
      } else if (largestCategory.category === "groceries") {
        awards.push({
          id: "grocery_boss",
          title: "Grocery Boss",
          icon: "🛒",
          recipient: "Groceries",
          detail: `Pantry stocking took the top spot at ${largestCategory.percentage}% of expenses.`,
        });
      } else if (largestCategory.category === "sweets") {
        awards.push({
          id: "sweet_tooth",
          title: "Sweet Tooth",
          icon: "🍬",
          recipient: "Sweets",
          detail: `Sugar cravings ruled the month with ${largestCategory.percentage}% of total spending.`,
        });
      } else if (largestCategory.category === "food") {
        awards.push({
          id: "feast_master",
          title: "Feast Master",
          icon: "🍽️",
          recipient: "Food & Meals",
          detail: `Dining and meals took the crown at ${largestCategory.percentage}% of your budget.`,
        });
      } else if (largestCategory.category === "drinks") {
        awards.push({
          id: "hydration_hero",
          title: "Hydration Hero",
          icon: "🥤",
          recipient: "Drinks",
          detail: `Juices and cool drinks made up ${largestCategory.percentage}% of spending.`,
        });
      }
    }

    // Award 3: Tiny Treats (Micro-spending award)
    if (expenseCount >= 3 && averageExpensePaise <= 5000) {
      awards.push({
        id: "tiny_treats",
        title: "Tiny Treats",
        icon: "💸",
        recipient: "Master of Micro-Kharchaa",
        detail: `Kept it light with an average spend of just ${formatPaise(
          averageExpensePaise
        )} per item.`,
      });
    }

    // Award 4: Teamwork Trophy (Shared spending award)
    if (expenseCount >= 2 && sharedCount / expenseCount >= 0.5) {
      awards.push({
        id: "teamwork_trophy",
        title: "Teamwork Trophy",
        icon: "🤝",
        recipient: "Srujan & Disha",
        detail: `${sharedCount} of ${expenseCount} expenses were shared together 50/50.`,
      });
    }

    // Award 5: Peaceful Pocket (Quiet Month)
    if (expenseCount >= 1 && expenseCount <= 2 && awards.length < 3) {
      awards.push({
        id: "quiet_month",
        title: "Disciplined Month",
        icon: "🧘",
        recipient: "Disciplined Spenders",
        detail: `Only ${expenseCount} total expense${
          expenseCount === 1 ? "" : "s"
        } logged all month long.`,
      });
    }

    // 7. Editorial Personality Copy
    let headline = "A little kharchaa, a little bachat.";
    let subheadline = `Here is where your discretionary spending went in ${monthName} ${year}.`;

    if (largestCategory?.category === "coffee_tea") {
      headline = "Apparently coffee had things to say this month.";
      subheadline = `Coffee & tea represented ${largestCategory.percentage}% of your food spending.`;
    } else if (largestCategory?.category === "sweets") {
      headline = "Small sweet treats, large consequences.";
      subheadline = `Desserts and mithai took the lion's share of your spending.`;
    } else if (largestCategory?.category === "groceries") {
      headline = "The pantry was well loved this month.";
      subheadline = `Groceries and supplies led your discretionary spending.`;
    } else if (largestCategory?.category === "food") {
      headline = "Good food, good times.";
      subheadline = `Meals and dining out was your top spending focus.`;
    } else if (largestCategory?.category === "drinks") {
      headline = "Staying refreshed at all costs.";
      subheadline = `Cold drinks and beverages led your monthly spending.`;
    } else if (expenseCount >= 15) {
      headline = "Your wallet had a very busy month.";
      subheadline = `You logged ${expenseCount} expenses totaling ${formatPaise(
        totalSpentPaise
      )}.`;
    }

    return {
      status: "success",
      data: {
        year,
        month,
        month_name: monthName,
        total_spent_paise: totalSpentPaise,
        expense_count: expenseCount,
        average_expense_paise: averageExpensePaise,
        largest_expense: largestExpense,
        largest_category: largestCategory,
        categories,
        awards: awards.slice(0, 4), // Cap at 4 tasteful awards
        headline,
        subheadline,
        srujan_total_paise: srujanTotalPaise,
        disha_total_paise: dishaTotalPaise,
      },
    };
  } catch (err) {
    console.error("[fetchMonthlyRecap]", err);
    return {
      status: "error",
      data: null,
      error: DB_UNAVAILABLE_MESSAGE,
    };
  }
}
