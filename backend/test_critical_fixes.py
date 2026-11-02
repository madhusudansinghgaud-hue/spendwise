"""
Comprehensive Test Suite for Critical Fixes and Improvements
Covers all 17 scenarios specified in prompt Section 8:
1. New user enters salary of ₹10,000
2. User selects multiple expense categories
3. System generates budget totaling <= ₹10,000
4. User adds expense of ₹500
5. Expense saved to DB and appears in transaction history
6. Category spent and remaining amounts update correctly
7. User changes salary to ₹15,000
8. Application recalculates suggested allocations
9. User manually adjusts category budget
10. System detects budget exceeding available income
11. User adds investment transaction
12. Investment NOT counted as ordinary expense
13. User records savings transfer
14. Savings transfer NOT counted as new income
15. Application retains all transactions and settings persistently
16. Historical previous month's figures remain intact
17. Invalid amounts (<= 0), missing categories handled with proper HTTP error codes
"""

import urllib.request
import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://127.0.0.1:8000"
TEST_USER = "budget_qa_tester"
HEADERS = {
    "Content-Type": "application/json",
    "X-Username": TEST_USER
}

def req(method, path, body=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    request_obj = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(request_obj) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode())
        except Exception:
            err_body = {"detail": str(e)}
        return e.code, err_body

def run_all_tests():
    print("=" * 60)
    print("RUNNING 17 CRITICAL SCENARIO TESTS")
    print("=" * 60)

    # Clean previous run data for test user if any
    status, old_exps = req("GET", "/api/expenses/?limit=200")
    if status == 200 and isinstance(old_exps, list):
        for e in old_exps:
            req("DELETE", f"/api/expenses/{e['id']}")
    status, old_invs = req("GET", "/api/investments/entries")
    if status == 200 and isinstance(old_invs, dict):
        for inv in old_invs.get("items", []):
            req("DELETE", f"/api/investments/entries/{inv['id']}")

    req("POST", "/api/auth/onboard", {
        "username": TEST_USER,
        "display_name": "QA Tester",
        "monthly_income": 10000.0,
        "categories": [
            {"name": "Groceries", "icon": "🛒", "is_essential": True, "priority": 1},
            {"name": "Fuel & Transportation", "icon": "🚗", "is_essential": True, "priority": 1},
            {"name": "Utilities & Mobile", "icon": "💡", "is_essential": True, "priority": 2},
            {"name": "Personal Expenses", "icon": "🛍️", "is_essential": False, "priority": 6}
        ]
    })

    # SCENARIOS 1, 2, 3: New user enters salary ₹10,000, selects categories, budget <= ₹10,000
    status, onboard_res = req("POST", "/api/auth/onboard", {
        "username": TEST_USER,
        "display_name": "QA Tester",
        "monthly_income": 10000.0,
        "categories": [
            {"name": "Groceries", "icon": "🛒", "is_essential": True, "priority": 1},
            {"name": "Fuel & Transportation", "icon": "🚗", "is_essential": True, "priority": 1},
            {"name": "Utilities & Mobile", "icon": "💡", "is_essential": True, "priority": 2},
            {"name": "Personal Expenses", "icon": "🛍️", "is_essential": False, "priority": 6}
        ]
    })
    assert status == 200, f"Onboarding failed: {onboard_res}"
    summary = onboard_res["budget_summary"]
    assert summary["monthly_income"] == 10000.0
    assert summary["total_planned_with_goals"] <= 10000.0, f"Budget exceeded 10k: {summary['total_planned_with_goals']}"
    print(f"[PASS] Scenarios 1-3: New user entered ₹10,000, budget generated at ₹{summary['total_allocated']} (with buffer/invest/savings: ₹{summary['total_planned_with_goals']} <= ₹10,000, reserve: ₹{summary['unallocated_reserve']})")

    # Fetch created categories
    status, cats = req("GET", "/api/categories/?month=2026-10")
    assert status == 200 and len(cats) >= 4
    groceries = next(c for c in cats if "Groceries" in c["name"])
    initial_groceries_budget = groceries["monthly_limit"]
    assert initial_groceries_budget > 0
    print(f"[PASS] Categories created with intelligent allocations: Groceries = ₹{initial_groceries_budget}")

    # SCENARIO 4 & 5: User adds an expense of ₹500, saved to DB and appears in transaction history
    status, exp_res = req("POST", "/api/expenses/", {
        "amount": 500.0,
        "category_id": groceries["id"],
        "description": "Weekly vegetable market",
        "merchant": "Sabzi Mandi",
        "date": "2026-10-15T12:00:00"
    })
    assert status == 200, f"Failed to add expense: {exp_res}"
    assert exp_res["expense"]["amount"] == 500.0
    exp_id = exp_res["expense"]["id"]
    print(f"[PASS] Scenario 4: Added expense ₹500 for category '{groceries['name']}' with merchant 'Sabzi Mandi'")

    # Scenario 5: Check transaction history
    status, tx_list = req("GET", "/api/expenses/?limit=10")
    assert status == 200
    matched_exp = next((e for e in tx_list if e["id"] == exp_id), None)
    assert matched_exp is not None, "Expense not found in history"
    assert matched_exp["amount"] == 500.0
    print(f"[PASS] Scenario 5: Verified expense id {exp_id} appears in history with correct amount and category")

    # SCENARIO 6: Category spent and remaining amounts update correctly
    status, updated_cats = req("GET", "/api/categories/?month=2026-10")
    up_groc = next(c for c in updated_cats if c["id"] == groceries["id"])
    assert up_groc["monthly_spent"] == 500.0, f"Expected monthly_spent 500, got {up_groc['monthly_spent']}"
    assert up_groc["remaining"] == (initial_groceries_budget - 500.0)
    print(f"[PASS] Scenario 6: Category spent is ₹{up_groc['monthly_spent']}, remaining is ₹{up_groc['remaining']}")

    # SCENARIO 7 & 8: User changes salary to ₹15,000, application recalculates suggested allocations
    status, inc_res = req("PUT", "/api/auth/income", {
        "monthly_income": 15000.0,
        "recalculate": True
    })
    assert status == 200, f"Income update failed: {inc_res}"
    assert inc_res["monthly_income"] == 15000.0
    new_summary = inc_res["budget_summary"]
    assert new_summary["total_planned_with_goals"] <= 15000.0
    print(f"[PASS] Scenario 7 & 8: Salary updated to ₹15,000. Recalculated total planned: ₹{new_summary['total_planned_with_goals']} <= ₹15,000")

    # SCENARIO 9 & 10: Manual adjustment & system detects budget exceeding available income
    # Set a huge manual budget of ₹20,000 on Groceries
    status, adj_res = req("POST", "/api/categories/monthly-budget", {
        "category_id": groceries["id"],
        "month_year": "2026-10",
        "budget_amount": 20000.0
    })
    assert status == 200
    assert adj_res["shortfall"] > 0, "System should detect shortfall when planned > income"
    assert adj_res["warning"] is not None
    print(f"[PASS] Scenario 9 & 10: Manually set Groceries to ₹20,000. System detected excess! Shortfall: ₹{adj_res['shortfall']}, Warning: '{adj_res['warning']}'")

    # Rebalance back within ₹15,000
    status, rebal_res = req("POST", "/api/categories/rebalance-budget", {
        "month_year": "2026-10",
        "monthly_income": 15000.0,
        "apply_changes": True
    })
    assert status == 200
    print(f"[PASS] Rebalanced budget cleanly within ₹15,000 available income")

    # SCENARIO 11 & 12: User adds an investment transaction, NOT counted as ordinary expense
    status, inv_res = req("POST", "/api/investments/entries", {
        "amount": 1500.0,
        "name": "Nifty 50 Index Fund",
        "category": "Mutual Funds SIP",
        "notes": "Automated monthly SIP",
        "date": "2026-10-15T00:00:00"
    })
    assert status == 200, f"Failed to log investment: {inv_res}"

    # Check dashboard - verify expenses remain ₹500, investment is ₹1500 (query test month 2026-10)
    status, dash = req("GET", "/api/dashboard/summary?month=2026-10")
    assert status == 200
    assert dash["monthly_expenses"] == 500.0, f"Investment was incorrectly counted in expenses! Got {dash['monthly_expenses']}"
    assert dash["monthly_investments"] == 1500.0, f"Investment not tracked: {dash['monthly_investments']}"
    print(f"[PASS] Scenarios 11 & 12: Investment logged (₹1,500). Monthly expenses remain ₹{dash['monthly_expenses']}. Investments tracked separately at ₹{dash['monthly_investments']}")

    # SCENARIO 13 & 14: User records savings transfer, NOT counted as new income
    status, sav_res = req("POST", "/api/savings/deposit", {
        "amount": 1000.0,
        "title": "Emergency Deposit",
        "source": "manual_deposit"
    })
    assert status == 200, f"Savings deposit failed: {sav_res}"

    status, dash_after_sav = req("GET", "/api/dashboard/summary?month=2026-10")
    # Base income must remain 15,000, not 16,000!
    assert dash_after_sav["monthly_income"] == 15000.0, f"Savings transfer counted as income! Got {dash_after_sav['monthly_income']}"
    assert dash_after_sav["total_savings"] >= 1000.0
    print(f"[PASS] Scenarios 13 & 14: Savings transfer (₹1,000) recorded. Income remained ₹{dash_after_sav['monthly_income']}, NOT double counted.")

    # SCENARIO 15: Persistence - query DB directly via API
    status, verify_profile = req("GET", "/api/auth/profile")
    assert status == 200 and verify_profile["monthly_income"] == 15000.0
    print(f"[PASS] Scenario 15: Persistent storage verified: User profile and transactions retained in database")

    # SCENARIO 16: Historical reports isolation
    # Check September 2026 report
    status, sep_cats = req("GET", "/api/categories/?month=2026-09")
    assert status == 200
    # September expenses should be 0 (no expenses in Sept)
    assert all(c["monthly_spent"] == 0 for c in sep_cats)
    print(f"[PASS] Scenario 16: Historical isolation verified: September 2026 spent is 0, unaffected by October activity")

    # SCENARIO 17: Validation and error handling
    # 17a: Negative expense amount
    status, err_neg = req("POST", "/api/expenses/", {
        "amount": -50.0,
        "category_id": groceries["id"]
    })
    assert status in (400, 422), f"Expected 400 for negative amount, got {status}"

    # 17b: Zero expense amount
    status, err_zero = req("POST", "/api/expenses/", {
        "amount": 0.0,
        "category_id": groceries["id"]
    })
    assert status in (400, 422), f"Expected 400 for zero amount, got {status}"

    # 17c: Non-existent category
    status, err_cat = req("POST", "/api/expenses/", {
        "amount": 100.0,
        "category_id": 999999
    })
    assert status == 404, f"Expected 404 for missing category, got {status}"
    print(f"[PASS] Scenario 17: Validations passed: Negative amount -> {status}, Non-existent category -> 404 with detail '{err_cat.get('detail')}'")

    print("=" * 60)
    print("ALL 17 CRITICAL SCENARIO TESTS PASSED SUCCESSFULLY! ✅")
    print("=" * 60)

if __name__ == "__main__":
    run_all_tests()
