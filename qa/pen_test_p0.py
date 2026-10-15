#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
 BOKO - PEN TEST P0 (an ninh + tien) — chung minh cac lo hong da duoc va
================================================================================
Tap trung vao nhom P0 da sua:
    P01  IDOR: khach vang lai KHONG duoc thanh toan bang order_id co san (MoMo)
    P02  IDOR: khach vang lai KHONG duoc thanh toan bang order_id co san (VNPay)
    P03  IDOR: khach vang lai KHONG duoc thanh toan bang order_id co san (PayPal)
    P04  IDOR: nguoi dung A khong tao duoc phien thanh toan cho don cua B
    P05  Idempotency: cung X-Idempotency-Key giua 2 nguoi -> KHONG tra don cua nhau
    P06  Ton kho: huy don se hoan kho (co StockDeducted qua luong gio hang)
    P07  Momo IPN: chu ky gia mao bi tu choi (khong lat don thanh paid)
    P08  Simulator/IPN khong con lo raw/expected signature

Cach dung:
    python qa/pen_test_p0.py
    python qa/pen_test_p0.py --base https://localhost \
        --admin admin@boko.com:Admin@12345 --user test@gmail.com:Test@12345
LUU Y: Chi chay tren he thong ban co quyen kiem thu.
================================================================================
"""
import argparse
import datetime
import json
import os
import sys
import time

import requests
from requests.adapters import HTTPAdapter
import urllib3

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://localhost"
TIMEOUT = 15
ADMIN_CREDS = ("admin@boko.com", "Admin@12345")
USER_CREDS = ("test@gmail.com", "Test@12345")
OUTDIR = os.path.dirname(os.path.abspath(__file__))

SESSION = requests.Session()
SESSION.verify = False
SESSION.mount("https://", HTTPAdapter(max_retries=1))
TOKENS = {"admin": None, "user": None}
RESULTS = []


class C:
    RESET = "\033[0m"; BOLD = "\033[1m"; GREEN = "\033[92m"; RED = "\033[91m"
    YELLOW = "\033[93m"; CYAN = "\033[96m"


def http(method, path, token=None, body=None, params=None, headers=None, timeout=None):
    url = path if path.startswith("http") else BASE_URL + path
    h = dict(headers or {})
    if token:
        h["Authorization"] = "Bearer " + token
    kwargs = dict(headers=h, params=params, timeout=timeout or TIMEOUT)
    if body is not None:
        kwargs["json"] = body
    for i in range(3):
        resp = SESSION.request(method, url, **kwargs)
        if resp.status_code == 429 and i < 2:
            time.sleep(1.5)
            continue
        return resp
    return resp


def safe_json(resp):
    try:
        return resp.json()
    except Exception:
        return {}


def login(identifier, password):
    r = http("POST", "/api/login", body={"identifier": identifier, "password": password})
    return safe_json(r).get("token") if r.status_code == 200 else None


def first_book():
    data = safe_json(http("GET", "/api/books", params={"limit": 5})).get("data") or []
    return data[0] if data else None


def book_stock(book_id):
    data = safe_json(http("GET", "/api/books", params={"limit": 200})).get("data") or []
    for b in data:
        if str(b.get("id")) == str(book_id):
            return b.get("stock")
    return None


def create_cod(token, book_id, qty=1, key=None):
    headers = {"X-Idempotency-Key": key} if key else None
    body = {
        "shipping_address": "123 Test IDOR, HCM",
        "phone": "0900000001",
        "email": "pentester@boko.com",
        "customer_name": "PT",
        "items": [{"book_id": book_id, "quantity": qty, "price": 1}],
    }
    r = http("POST", "/api/orders/cod/create", token=token, body=body, headers=headers)
    return r, safe_json(r).get("order_id")


def cancel_order(token, order_id):
    return http("PUT", f"/api/orders/{order_id}/cancel", token=token)


def record(tid, name, severity, status, detail, evidence=""):
    icon = {"PASS": f"{C.GREEN}PASS{C.RESET}", "FAIL": f"{C.RED}FAIL{C.RESET}",
            "WARN": f"{C.YELLOW}WARN{C.RESET}", "INFO": f"{C.CYAN}INFO{C.RESET}"}[status]
    print(f"  [{tid}] {name:<48} {icon}  ({severity})")
    RESULTS.append({"id": tid, "name": name, "severity": severity,
                    "status": status, "detail": detail, "evidence": evidence})


# ================================ KIEM THU ================================

def p01_idor_momo_guest():
    at = TOKENS["admin"]
    _, oid = create_cod(at, first_book()["id"])
    if not oid:
        record("P01", "IDOR momo/create (guest + order_id)", "High", "INFO", "Bo qua: khong tao duoc don.")
        return
    r = http("POST", "/api/payment/momo/create",
             body={"order_id": oid, "amount": 50000, "redirect_url": BASE_URL + "/cb"})
    body = safe_json(r)
    leaked = r.status_code in (200, 201) and body.get("pay_url")
    record("P01", "IDOR momo/create (guest + order_id)", "High",
           "FAIL" if leaked else "PASS",
           f"Guest tao duoc phien MoMo cho don #{oid} cua nguoi khac!" if leaked
           else "Guest bi chan khi dung order_id co san.",
           f"POST /api/payment/momo/create order_id={oid} -> {r.status_code}")
    cancel_order(at, oid)


def p02_idor_vnpay_guest():
    at = TOKENS["admin"]
    _, oid = create_cod(at, first_book()["id"])
    if not oid:
        record("P02", "IDOR vnpay/create (guest + order_id)", "High", "INFO", "Bo qua: khong tao duoc don.")
        return
    r = http("POST", "/api/payment/vnpay/create",
             body={"order_id": oid, "amount": 50000, "redirect_url": BASE_URL + "/cb"})
    leaked = r.status_code in (200, 201) and safe_json(r).get("payment_url")
    record("P02", "IDOR vnpay/create (guest + order_id)", "High",
           "FAIL" if leaked else "PASS",
           f"Guest tao duoc phien VNPay cho don #{oid} cua nguoi khac!" if leaked
           else "Guest bi chan khi dung order_id co san.",
           f"POST /api/payment/vnpay/create order_id={oid} -> {r.status_code}")
    cancel_order(at, oid)


def p03_idor_paypal_guest():
    at = TOKENS["admin"]
    _, oid = create_cod(at, first_book()["id"])
    if not oid:
        record("P03", "IDOR paypal/create (guest + order_id)", "High", "INFO", "Bo qua: khong tao duoc don.")
        return
    r = http("POST", "/api/payment/paypal/create",
             body={"order_id": oid, "amount": 50000, "redirect_url": BASE_URL + "/cb"})
    leaked = r.status_code in (200, 201) and safe_json(r).get("approve_url")
    record("P03", "IDOR paypal/create (guest + order_id)", "High",
           "FAIL" if leaked else "PASS",
           f"Guest tao duoc phien PayPal cho don #{oid} cua nguoi khac!" if leaked
           else "Guest bi chan khi dung order_id co san.",
           f"POST /api/payment/paypal/create order_id={oid} -> {r.status_code}")
    cancel_order(at, oid)


def p04_idor_cross_user():
    at, ut = TOKENS["admin"], TOKENS["user"]
    _, oid = create_cod(at, first_book()["id"])
    if not (oid and ut):
        record("P04", "IDOR cross-user (user A -> don B)", "High", "INFO", "Bo qua: thieu du lieu.")
        return
    r = http("POST", "/api/payment/momo/create", token=ut,
             body={"order_id": oid, "amount": 50000, "redirect_url": BASE_URL + "/cb"})
    leaked = r.status_code in (200, 201) and safe_json(r).get("pay_url")
    record("P04", "IDOR cross-user (user A -> don B)", "High",
           "FAIL" if leaked else "PASS",
           f"User tao duoc phien thanh toan cho don #{oid} cua admin!" if leaked
           else "Bi chan (404) khi dung order_id cua nguoi khac.",
           f"POST /api/payment/momo/create (user token) order_id={oid} -> {r.status_code}")
    cancel_order(at, oid)


def p05_idempotency_scoping():
    at, ut = TOKENS["admin"], TOKENS["user"]
    if not (at and ut):
        record("P05", "Idempotency key khong ro ri giua user", "High", "INFO", "Bo qua: thieu token.")
        return
    book = first_book()["id"]
    key = f"PT-{int(time.time() * 1000)}"
    _, oid_user = create_cod(ut, book, key=key)
    _, oid_admin = create_cod(at, book, key=key)
    # Retry cua chinh user phai tra dung don cua user (khong phai cua admin)
    _, oid_user_retry = create_cod(ut, book, key=key)
    leaked = (oid_user and oid_admin and str(oid_user) == str(oid_admin))
    wrong_retry = (oid_user_retry and str(oid_user_retry) != str(oid_user))
    ok = oid_user and oid_admin and not leaked
    record("P05", "Idempotency key khong ro ri giua user", "High",
           "FAIL" if (leaked or wrong_retry) else ("PASS" if ok else "WARN"),
           ("Hai user khac nhau nhan CUNG mot don khi trung key!" if leaked
            else "Retry cua user tra sai don." if wrong_retry
            else "Moi user nhan dung don cua minh khi trung key."),
           f"user={oid_user} admin={oid_admin} user_retry={oid_user_retry}")
    for t, o in ((ut, oid_user), (at, oid_admin)):
        if o:
            cancel_order(t, o)


def p06_stock_refunded_on_cancel():
    ut = TOKENS["user"]
    book = first_book()
    if not (ut and book):
        record("P06", "Huy don hoan ton kho (StockDeducted)", "High", "INFO", "Bo qua: thieu du lieu.")
        return
    bid = book["id"]
    s0 = book_stock(bid)
    http("POST", "/api/cart", token=ut, body={"book_id": bid, "quantity": 1})
    r = http("POST", "/api/orders", token=ut,
             body={"shipping_address": "123 Test Stock, HCM", "phone": "0900000002",
                   "payment_method": "cod"})
    oid = safe_json(r).get("order_id")
    s1 = book_stock(bid)
    if not oid:
        record("P06", "Huy don hoan ton kho (StockDeducted)", "High", "INFO",
               f"Bo qua: luong gio hang khong tao duoc don ({r.status_code}).", f"body={r.text[:120]}")
        return
    cancel_order(ut, oid)
    s2 = book_stock(bid)
    deducted = (s0 is not None and s1 is not None and s1 == s0 - 1)
    refunded = (s0 is not None and s2 == s0)
    record("P06", "Huy don hoan ton kho (StockDeducted)", "High",
           "PASS" if (deducted and refunded) else "FAIL",
           ("Tru kho khi dat va hoan kho khi huy OK." if (deducted and refunded)
            else "Sai lech ton kho (co the khong hoan kho khi huy)."),
           f"stock: truoc={s0} sau_dat={s1} sau_huy={s2}")


def p07_momo_ipn_forged_signature():
    at = TOKENS["admin"]
    _, oid = create_cod(at, first_book()["id"])
    if not oid:
        record("P07", "Momo IPN chu ky gia mao", "Critical", "INFO", "Bo qua: khong tao duoc don.")
        return
    payload = {"partnerCode": "MOMOBKUN20180529", "orderId": f"BOKO_{oid}_1",
               "requestId": "REQ_X", "amount": 1, "resultCode": 0,
               "message": "ok", "transId": 1, "signature": "fake_sig"}
    r = http("POST", "/api/payment/momo/ipn", body=payload)
    # Doc lai don: phai KHONG duoc lat thanh paid
    st = safe_json(http("GET", f"/api/payment/momo/status/{oid}", token=at))
    flipped = st.get("payment_status") == "paid"
    record("P07", "Momo IPN chu ky gia mao", "Critical",
           "FAIL" if flipped else "PASS",
           "IPN gia mao lat duoc don thanh paid!" if flipped
           else "IPN chu ky sai bi tu choi, don khong doi trang thai.",
           f"POST ipn -> {r.status_code}; status -> {st.get('payment_status')}")
    cancel_order(at, oid)


def p08_no_signature_leak():
    """Simulator (local, mock ON) khong con tra raw/expected signature."""
    at = TOKENS["admin"]
    _, oid = create_cod(at, first_book()["id"])
    if not oid:
        record("P08", "Khong lo chu ky trong phan hoi gateway", "Medium", "INFO", "Bo qua.")
        return
    r = http("POST", "/api/payment/momo/simulator-ipn",
             body={"order_id": f"BOKO_{oid}_1", "result_code": 3, "tamper_signature": True})
    txt = r.text
    leaked = ("expected_signature" in txt) or ("raw_signature_data" in txt)
    record("P08", "Khong lo chu ky trong phan hoi gateway", "Medium",
           "FAIL" if leaked else "PASS",
           "Phan hoi con lo chu ky/du lieu ky!" if leaked
           else "Khong lo chu ky/du lieu ky trong phan hoi.",
           f"POST simulator-ipn -> {r.status_code}")
    cancel_order(at, oid)


ALL_TESTS = [p01_idor_momo_guest, p02_idor_vnpay_guest, p03_idor_paypal_guest,
             p04_idor_cross_user, p05_idempotency_scoping, p06_stock_refunded_on_cancel,
             p07_momo_ipn_forged_signature, p08_no_signature_leak]


def preflight():
    print(f"{C.BOLD}=== BOKO PEN TEST P0 | {BASE_URL} ==={C.RESET}")
    try:
        print(f"  Ket noi root: HTTP {http('GET', '/').status_code}")
    except Exception as e:
        print(f"{C.RED}Khong ket noi duoc {BASE_URL}: {e}{C.RESET}")
        sys.exit(2)
    TOKENS["admin"] = login(*ADMIN_CREDS)
    TOKENS["user"] = login(*USER_CREDS)
    print(f"  Token admin: {'OK' if TOKENS['admin'] else 'THAT BAI'} | "
          f"Token user: {'OK' if TOKENS['user'] else 'THAT BAI'}")


def write_report():
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    summary = {}
    for r in RESULTS:
        summary[r["status"]] = summary.get(r["status"], 0) + 1
    path = os.path.join(OUTDIR, f"pentest_p0_report_{ts}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"target": BASE_URL, "time": ts, "summary": summary, "results": RESULTS},
                  f, ensure_ascii=False, indent=2)
    print(f"\n{C.BOLD}Bao cao da luu:{C.RESET}\n  {path}")
    return summary


def main():
    global BASE_URL, ADMIN_CREDS, USER_CREDS, OUTDIR
    ap = argparse.ArgumentParser(description="Boko PenTest P0 (an ninh + tien)")
    ap.add_argument("--base", default=BASE_URL)
    ap.add_argument("--admin", default=":".join(ADMIN_CREDS))
    ap.add_argument("--user", default=":".join(USER_CREDS))
    ap.add_argument("--outdir", default=OUTDIR)
    args = ap.parse_args()
    BASE_URL = args.base.rstrip("/")
    ADMIN_CREDS = tuple(args.admin.split(":", 1))
    USER_CREDS = tuple(args.user.split(":", 1))
    OUTDIR = args.outdir
    os.makedirs(OUTDIR, exist_ok=True)

    preflight()
    for fn in ALL_TESTS:
        try:
            fn()
        except Exception as e:
            record(fn.__name__, fn.__doc__ or fn.__name__, "-", "WARN", "Test loi khi thuc thi.", repr(e))
        time.sleep(0.2)

    summary = write_report()
    print(f"\n  PASS={summary.get('PASS',0)}  WARN={summary.get('WARN',0)}  "
          f"FAIL={summary.get('FAIL',0)}  INFO={summary.get('INFO',0)}")
    return 1 if summary.get("FAIL", 0) else 0


if __name__ == "__main__":
    sys.exit(main())
