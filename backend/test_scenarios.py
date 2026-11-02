import urllib.request
import json
import sys

# Ensure UTF-8 output on Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://localhost:8000"
HEADERS = {
    "Content-Type": "application/json",
    "X-Username": "test_user_qa",
    "X-User-Id": "99"
}

def request(method, path, body=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

def run_tests():
    print("=== STARTING SCENARIO TESTS ===")

    # 0. Health check
    status, res = request("GET", "/api/health")
    assert status == 200, f"Health check failed: {res}"
    print("[PASS] [0/14] Health check passed")

    # Clean up prior test runs
    status, old_exps = request("GET", "/api/expenses")
    for e in (old_exps if isinstance(old_exps, list) else []):
        request("DELETE", f"/api/expenses/{e['id']}")
    status, old_incs = request("GET", "/api/income")
    for i in (old_incs.get("items", []) if isinstance(old_incs, dict) else []):
        request("DELETE", f"/api/income/{i['id']}")
    status, old_invs = request("GET", "/api/investments/entries")
    for inv in (old_invs.get("items", []) if isinstance(old_invs, dict) else []):
        request("DELETE", f"/api/investments/entries/{inv['id']}")
    # Clean up savings records so settle-month is idempotent across test runs
    request("DELETE", "/api/savings/reset-test-data")


    # 1. Add Income
    status, res = request("POST", "/api/income", {
        "amount": 50000.0,
        "source": "Salary",
        "description": "Monthly Salary Credit",
        "date": "2026-10-01"
    })
    assert status == 200, f"Add income failed: {res}"
    assert res["amount"] == 50000.0
    print(f"[PASS] [1/14] Add Income: ₹{res['amount']} logged")

    # 2. Get/Create Categories
    status, cats = request("GET", "/api/categories?month=2026-10")
    assert status == 200
    if len(cats) == 0:
        status, cat1 = request("POST", "/api/categories", {"name": "Food", "icon": "🍔", "daily_limit": 400, "monthly_limit": 8000})
        status, cat2 = request("POST", "/api/categories", {"name": "Transport", "icon": "🚗", "daily_limit": 300, "monthly_limit": 4000})
        status, cat3 = request("POST", "/api/categories", {"name": "Shopping", "icon": "🛍️", "daily_limit": 300, "monthly_limit": 5000})
        status, cats = request("GET", "/api/categories?month=2026-10")
    food_cat = next((c for c in cats if "Food" in c["name"]), cats[0])
    trans_cat = next((c for c in cats if "Transport" in c["name"]), cats[1] if len(cats) > 1 else cats[0])
    shop_cat = next((c for c in cats if "Shop" in c["name"] or "Entertain" in c["name"]), cats[-1])
    print(f"[PASS] [2/14] Categories available: {len(cats)}")

    # 3. Set and modify monthly category budgets
    # Food: 8,000, Transport: 4,000, Shopping: 5,000 (Example from prompt)
    status, adj = request("POST", "/api/categories/monthly-budget", {
        "category_id": food_cat["id"],
        "month_year": "2026-10",
        "budget_amount": 8000.0
    })
    assert status == 200
    status, adj = request("POST", "/api/categories/monthly-budget", {
        "category_id": trans_cat["id"],
        "month_year": "2026-10",
        "budget_amount": 4000.0
    })
    assert status == 200
    status, adj = request("POST", "/api/categories/monthly-budget", {
        "category_id": shop_cat["id"],
        "month_year": "2026-10",
        "budget_amount": 5000.0
    })
    assert status == 200
    print("[PASS] [3/14] Set monthly category budgets: Food=₹8000, Transport=₹4000, Shopping=₹5000")

    # 4. Add multiple expenses under different categories
    # Food: 5,500 (within budget)
    status, exp1 = request("POST", "/api/expenses", {
        "amount": 5500.0,
        "category_id": food_cat["id"],
        "description": "Weekly Dining & Groceries",
        "date": "2026-10-05"
    })
    assert status == 200

    # Transport: 3,000 (within budget)
    status, exp2 = request("POST", "/api/expenses", {
        "amount": 3000.0,
        "category_id": trans_cat["id"],
        "description": "Fuel & Metro Pass",
        "date": "2026-10-06"
    })
    assert status == 200

    # Shopping: 6,000 (EXCEEDS budget of 5,000 by 1,000!)
    status, exp3 = request("POST", "/api/expenses", {
        "amount": 6000.0,
        "category_id": shop_cat["id"],
        "description": "Winter Clothes & Shoes",
        "date": "2026-10-07"
    })
    assert status == 200
    print("[PASS] [4/14] Added expenses: Food=₹5500, Transport=₹3000, Shopping=₹6000")

    # 5. Verify category remaining amounts & overspending
    status, updated_cats = request("GET", "/api/categories?month=2026-10")
    food_res = next(c for c in updated_cats if c["id"] == food_cat["id"])
    trans_res = next(c for c in updated_cats if c["id"] == trans_cat["id"])
    shop_res = next(c for c in updated_cats if c["id"] == shop_cat["id"])

    # Food: Budget 8,000, Spent 5,500, Remaining 2,500
    assert food_res["monthly_spent"] == 5500.0
    assert food_res["remaining"] == 2500.0
    assert food_res["monthly_exceeded"] is False

    # Transport: Budget 4,000, Spent 3,000, Remaining 1,000
    assert trans_res["monthly_spent"] == 3000.0
    assert trans_res["remaining"] == 1000.0
    assert trans_res["monthly_exceeded"] is False

    # Shopping: Budget 5,000, Spent 6,000, Remaining -1,000, Exceeded True, Excess 1,000
    assert shop_res["monthly_spent"] == 6000.0
    assert shop_res["remaining"] == -1000.0
    assert shop_res["monthly_exceeded"] is True
    assert shop_res["excess"] == 1000.0
    print(f"[PASS] [5/14] Verified category remaining calculations:\n"
          f"       - Food: Budget ₹8000, Spent ₹5500, Remaining ₹{food_res['remaining']}\n"
          f"       - Transport: Budget ₹4000, Spent ₹3000, Remaining ₹{trans_res['remaining']}\n"
          f"       - Shopping: Budget ₹5000, Spent ₹6000, Remaining -₹{abs(shop_res['remaining'])} (OVERSPENT: +₹{shop_res['excess']})")

    # 6. Add an investment
    status, inv = request("POST", "/api/investments/entries", {
        "amount": 10000.0,
        "name": "Nifty 50 Index Fund",
        "category": "Mutual Funds SIP",
        "date": "2026-10-02"
    })
    assert status == 200
    assert inv["amount"] == 10000.0
    print(f"[PASS] [6/14] Added Investment: ₹{inv['amount']} in {inv['name']}")

    # 7. Verify investment is NOT counted as an expense
    status, exp_list = request("GET", "/api/expenses?start_date=2026-10-01&end_date=2026-10-31")
    total_exp = sum(e["amount"] for e in exp_list)
    assert total_exp == 14500.0, f"Expected 14500 expense sum, got {total_exp}"
    print(f"[PASS] [7/14] Verified Investment is isolated: Total expenses = ₹{total_exp} (5500+3000+6000)")

    # 8. Verify monthly remaining amount: Income (50000) - Expenses (14500) - Investments (10000) = Remaining (25500)
    status, sav_sum = request("GET", "/api/savings/summary?month=2026-10")
    fin = sav_sum["month_financials"]
    assert fin["income"] == 50000.0
    assert fin["expenses"] == 14500.0
    assert fin["investments"] == 10000.0
    assert fin["remaining"] == 25500.0
    print(f"[PASS] [8/14] Verified Remaining Calculation: 50,000 - 14,500 - 10,000 = ₹{fin['remaining']}")

    # 9. Verify month-end leftover is added to savings
    status, settle = request("POST", "/api/savings/settle-month", {"month_year": "2026-10"})
    assert status == 200
    assert settle["status"] == "success"
    assert settle["savings_added"] == 25500.0
    print(f"[PASS] [9/14] Settled 2026-10: Added ₹{settle['savings_added']} to Savings Vault")

    # 10. Verify savings are NOT duplicated when called again
    status, settle2 = request("POST", "/api/savings/settle-month", {"month_year": "2026-10"})
    assert status == 200
    assert settle2["status"] == "already_settled"
    print("[PASS] [10/14] Idempotency verified: Re-settle returned 'already_settled'. Zero double-counting!")

    # 11. Open monthly financial analysis and previous month report
    status, rep = request("GET", "/api/analysis/monthly?month=2026-10")
    assert status == 200
    assert rep["summary"]["income"] == 50000.0
    assert rep["summary"]["expenses"] == 14500.0
    assert rep["summary"]["investments"] == 10000.0
    assert "2026 Financial Summary" in rep["summary"]["summary_text"]
    assert len(rep["over_budget_categories"]) == 1
    print(f"[PASS] [11/14] Monthly Analysis Report Generated:\n{rep['summary']['summary_text']}")

    # 12. Check historical savings list
    status, hist = request("GET", "/api/savings/history")
    assert status == 200
    assert len(hist["monthly_records"]) >= 1
    assert hist["total_savings"] >= 25500.0
    print(f"[PASS] [12/14] Historical Monthly Savings Verified: {len(hist['monthly_records'])} month(s) stored")

    # 13. Test empty/past month (e.g. 2026-08)
    status, past_rep = request("GET", "/api/analysis/monthly?month=2026-08")
    assert status == 200
    print(f"[PASS] [13/14] Handled empty past month (2026-08): Income=₹{past_rep['summary']['income']}, Expenses=₹{past_rep['summary']['expenses']}")

    # 14. Dashboard summary check (query the test month so data aligns)
    status, dash = request("GET", "/api/dashboard/summary?month=2026-10")
    assert status == 200
    assert dash["monthly_income"] == 50000.0, f"Expected income 50000, got {dash['monthly_income']}"
    assert dash["monthly_expenses"] == 14500.0, f"Expected expenses 14500, got {dash['monthly_expenses']}"
    assert dash["monthly_investments"] == 10000.0, f"Expected investments 10000, got {dash['monthly_investments']}"
    assert dash["remaining_amount"] == 25500.0, f"Expected remaining 25500, got {dash['remaining_amount']}"
    print("[PASS] [14/14] Dashboard summary contains all 5 minimal core metrics cleanly")

    print("\n🎉 ALL 14 SCENARIO TESTS PASSED SUCCESSFULLY! 🚀")

if __name__ == "__main__":
    run_tests()
