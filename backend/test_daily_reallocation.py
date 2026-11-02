import urllib.request
import json
import sys
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE_URL = "http://127.0.0.1:8000"

def make_req(method, endpoint, data=None, headers=None):
    url = f"{BASE_URL}{endpoint}"
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            resp_body = resp.read().decode("utf-8")
            return status, json.loads(resp_body) if resp_body else {}
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode("utf-8")
        try:
            parsed = json.loads(resp_body)
        except:
            parsed = {"detail": resp_body}
        return e.code, parsed

def run_tests():
    print("=" * 60)
    print("RUNNING DAILY, OCCASIONAL & SMART REALLOCATION TESTS")
    print("=" * 60)

    # 1. Register test user
    test_user = f"daily_user_{int(datetime.now().timestamp())}"
    status, reg_res = make_req("POST", "/api/auth/register", {
        "username": test_user,
        "password": "password123",
        "display_name": "Daily Tester",
        "role_title": "Budget Pro"
    })
    assert status == 200, f"Registration failed: {reg_res}"
    user_id = reg_res["user"]["id"]
    headers = {"X-User-Id": str(user_id), "X-Username": test_user}

    # Set income to ₹20,000
    status, _ = make_req("PUT", "/api/auth/income", {"monthly_income": 20000.0, "recalculate": True}, headers=headers)
    assert status == 200

    # 2. Create Daily Category: Coffee
    status, coffee_res = make_req("POST", "/api/categories/", {
        "name": "Coffee & Chai",
        "icon": "☕",
        "color": "#d97706",
        "frequency": "daily",
        "daily_limit": 50.0,
        "monthly_limit": 1500.0,
        "is_essential": False,
        "priority": 6
    }, headers=headers)
    assert status == 200
    coffee_id = coffee_res["id"]

    # 3. Create Occasional Category: Shopping
    status, cloth_res = make_req("POST", "/api/categories/", {
        "name": "Shopping & Gear",
        "icon": "👕",
        "color": "#8b5cf6",
        "frequency": "occasional",
        "expected_frequency": "2 times a month",
        "transaction_limit": 2000.0,
        "monthly_limit": 3000.0,
        "daily_limit": 0.0,
        "is_essential": False,
        "priority": 6
    }, headers=headers)
    assert status == 200
    cloth_id = cloth_res["id"]

    # Verify category properties retrieved
    status, cats = make_req("GET", "/api/categories/", headers=headers)
    assert status == 200
    coffee_cat = next(c for c in cats if c["id"] == coffee_id)
    assert coffee_cat["frequency"] == "daily"
    assert coffee_cat["daily_limit"] == 50.0
    assert coffee_cat["daily_remaining"] == 50.0
    print("[PASS] Section 10: Created Daily ('Coffee & Chai', limit Rs. 50) and Occasional categories")

    # 4. Record expense within limit: ₹30 for Coffee
    status, exp1_res = make_req("POST", "/api/expenses/", {
        "amount": 30.0,
        "category_id": coffee_id,
        "merchant": "Chai Point",
        "description": "Morning tea & snack"
    }, headers=headers)
    assert status == 200
    exp1 = exp1_res["expense"]
    assert exp1["is_over_budget"] == False

    # Check remaining daily allowance: should be 50 - 30 = 20
    status, cats = make_req("GET", "/api/categories/", headers=headers)
    coffee_cat = next(c for c in cats if c["id"] == coffee_id)
    assert coffee_cat["daily_spent"] == 30.0
    assert coffee_cat["daily_remaining"] == 20.0
    assert coffee_cat["monthly_spent"] == 30.0
    assert coffee_cat["remaining"] == 1470.0
    print("[PASS] Section 10: Daily allowance updated: spent ₹30, remaining daily allowance ₹20, monthly remaining ₹1470")

    # 5. Section 11: Daily Spending Limit Exceeded Alert
    # User tries to spend ₹30 (20 remaining -> excess is ₹10)
    status, alert1 = make_req("POST", "/api/expenses/check-limit", {
        "amount": 30.0,
        "category_id": coffee_id
    }, headers=headers)
    assert status == 200
    assert alert1["exceeded"] == True
    assert alert1["exceeded_daily"] == True
    assert alert1["daily_remaining"] == 20.0
    assert alert1["daily_excess"] == 10.0
    assert alert1["available_buffer"] > 0
    assert len(alert1["eligible_transfer_categories"]) > 0
    print("[PASS] Section 11: Daily limit check correctly flagged: remaining ₹20, excess ₹10")

    # 6. Section 12: Monthly Budget Limit Alert
    # Shopping has ₹3000 budget. Let's record ₹2,800.
    status, _ = make_req("POST", "/api/expenses/", {
        "amount": 2800.0,
        "category_id": cloth_id,
        "description": "Winter jacket"
    }, headers=headers)
    assert status == 200

    # Now attempt ₹500 in Shopping (budget ₹3000, spent ₹2800, remaining ₹200 -> excess ₹300)
    status, alert2 = make_req("POST", "/api/expenses/check-limit", {
        "amount": 500.0,
        "category_id": cloth_id
    }, headers=headers)
    assert status == 200
    assert alert2["exceeded"] == True
    assert alert2["exceeded_monthly"] == True
    assert alert2["monthly_remaining"] == 200.0
    assert alert2["monthly_excess"] == 300.0
    print("[PASS] Section 12: Monthly limit check correctly flagged: budget ₹3000, spent ₹2800, remaining ₹200, excess ₹300")

    # 7. Section 13: Smart Budget Reallocation Between Categories
    transfer_candidates = alert2["eligible_transfer_categories"]
    src_candidate = transfer_candidates[0]
    src_id = src_candidate["id"]
    src_orig_b = src_candidate["monthly_budget"]

    status, realloc_data = make_req("POST", "/api/categories/reallocate", {
        "source_type": "category",
        "source_category_id": src_id,
        "destination_category_id": cloth_id,
        "amount": 300.0,
        "reason": "Cover winter jacket overage"
    }, headers=headers)
    assert status == 200, f"Reallocate failed: {realloc_data}"
    assert realloc_data["destination"]["new_budget"] == 3300.0
    assert realloc_data["source"]["new_budget"] == src_orig_b - 300.0
    print(f"[PASS] Section 13: Reallocated ₹300 from {src_candidate['name']} to Shopping (new budget: ₹3,300)")

    # 8. Verify Reallocation History
    status, hist = make_req("GET", "/api/categories/reallocations", headers=headers)
    assert status == 200
    assert len(hist) >= 1
    assert hist[0]["amount"] == 300.0
    assert hist[0]["reason"] == "Cover winter jacket overage"
    print("[PASS] Section 13: Reallocation history audit trail verified")

    # 9. Emergency Buffer Integration
    # Reallocate ₹200 from Buffer to Coffee
    status, buf_data = make_req("POST", "/api/categories/reallocate", {
        "source_type": "buffer",
        "destination_category_id": coffee_id,
        "amount": 200.0,
        "reason": "Coffee buffer coverage"
    }, headers=headers)
    assert status == 200
    assert buf_data["destination"]["new_budget"] == 1700.0
    print("[PASS] Section 13: Emergency buffer reallocation applied successfully")

    # 10. Proceed With Over-Budget Status (Option 4)
    status, over_res = make_req("POST", "/api/expenses/", {
        "amount": 100.0,
        "category_id": coffee_id,
        "description": "Starbucks celebration",
        "accept_over_budget": True
    }, headers=headers)
    assert status == 200
    over_exp = over_res["expense"]
    assert over_exp["is_over_budget"] == True
    print("[PASS] Section 14: Over-budget transaction saved with explicit over_budget tag")

    # Verify transaction history shows over-budget tag
    status, tx_list = make_req("GET", "/api/expenses/", headers=headers)
    assert status == 200
    matching_tx = next(t for t in tx_list if t["id"] == over_exp["id"])
    assert matching_tx["is_over_budget"] == True
    print("[PASS] Section 14: Over-budget tag persists in transaction history")

    print("=" * 60)
    print("ALL DAILY, OCCASIONAL & SMART REALLOCATION TESTS PASSED! ✅")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
