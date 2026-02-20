---
name: ordercli
description: Order management CLI for tracking orders, managing inventory, and integrating with custom APIs. Use when the user asks to "track an order", "check inventory", "manage orders", "order status", or needs order/inventory management.
allowed-tools: Bash
---

# Order Management CLI (ordercli)

Track orders, manage inventory, and integrate with custom order management APIs.

## Trigger Phrases

- "注文を追跡して" / "注文状況を確認"
- "在庫を確認して" / "在庫管理"
- "Track order #..."
- "Check inventory for..."
- "List recent orders"
- "Update order status"

## Prerequisites

### env.yaml Configuration

```yaml
# Order management API settings
order_api_url: https://your-api.example.com/api/v1
order_api_key: YOUR_API_KEY

# Optional: Default store/warehouse ID
order_default_store: store_001
```

## Order Tracking

### Track Order by ID

```bash
source ~/.claude/lib/load_env.sh

curl -s "${ORDER_API_URL}/orders/ORDER_ID" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" \
  -H "Content-Type: application/json" | python3 -m json.tool
```

### List Recent Orders

```bash
source ~/.claude/lib/load_env.sh

# Get recent orders (last 20)
curl -s "${ORDER_API_URL}/orders?limit=20&sort=-created_at" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" | python3 -m json.tool

# Filter by status
curl -s "${ORDER_API_URL}/orders?status=pending&limit=20" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" | python3 -m json.tool

# Filter by date range
curl -s "${ORDER_API_URL}/orders?from=2026-01-01&to=2026-02-20&limit=50" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" | python3 -m json.tool
```

### Search Orders

```bash
# Search by customer name/email
curl -s "${ORDER_API_URL}/orders/search?q=customer_query" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" | python3 -m json.tool

# Search by tracking number
curl -s "${ORDER_API_URL}/orders?tracking_number=TRACKING_NUMBER" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" | python3 -m json.tool
```

### Update Order Status

```bash
curl -s -X PATCH "${ORDER_API_URL}/orders/ORDER_ID" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"status": "shipped", "tracking_number": "TRACK123456"}' | python3 -m json.tool
```

Order statuses: `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded`

### Create Order

```bash
curl -s -X POST "${ORDER_API_URL}/orders" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "name": "Customer Name",
      "email": "customer@example.com",
      "phone": "+1234567890"
    },
    "items": [
      {"sku": "PROD-001", "quantity": 2, "price": 29.99},
      {"sku": "PROD-002", "quantity": 1, "price": 49.99}
    ],
    "shipping_address": {
      "line1": "123 Main St",
      "city": "Tokyo",
      "state": "Tokyo",
      "postal_code": "100-0001",
      "country": "JP"
    }
  }' | python3 -m json.tool
```

## Inventory Management

### Check Inventory

```bash
# Get all products
curl -s "${ORDER_API_URL}/inventory?limit=50" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" | python3 -m json.tool

# Check specific product
curl -s "${ORDER_API_URL}/inventory/SKU_CODE" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" | python3 -m json.tool

# Low stock items
curl -s "${ORDER_API_URL}/inventory?low_stock=true" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" | python3 -m json.tool
```

### Update Inventory

```bash
# Update stock quantity
curl -s -X PATCH "${ORDER_API_URL}/inventory/SKU_CODE" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 100}' | python3 -m json.tool

# Adjust stock (increment/decrement)
curl -s -X POST "${ORDER_API_URL}/inventory/SKU_CODE/adjust" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"adjustment": -5, "reason": "Sold via direct sale"}' | python3 -m json.tool
```

## Shipping Integration

### Common Carriers

```bash
# Track via carrier API (example: AfterShip universal tracking)
curl -s "https://api.aftership.com/v4/trackings/CARRIER/TRACKING_NUMBER" \
  -H "aftership-api-key: YOUR_AFTERSHIP_KEY" | python3 -m json.tool

# Create shipment label (varies by carrier)
curl -s -X POST "${ORDER_API_URL}/shipments" \
  -H "Authorization: Bearer ${ORDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "ORDER_ID",
    "carrier": "ups",
    "service": "ground",
    "weight": 2.5,
    "dimensions": {"length": 10, "width": 8, "height": 4}
  }' | python3 -m json.tool
```

## Local Order File (Offline Mode)

If no API is configured, manage orders via local JSON file:

```bash
source ~/.claude/lib/load_env.sh

# Initialize orders file
mkdir -p ./outputs
echo '{"orders": [], "inventory": []}' > ./outputs/orders.json

# Read orders
cat ./outputs/orders.json | python3 -m json.tool
```

Use the Python script for more complex local operations:

```bash
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/ordercli/ordercli.py --action list
run_python ~/.claude/skills/ordercli/ordercli.py --action track --order-id "ORD-001"
run_python ~/.claude/skills/ordercli/ordercli.py --action add --data '{"item": "Widget", "qty": 5}'
```

## Response Format

### Order Status
```
Order #ORD-2026-001
  Status: Shipped
  Customer: John Smith (john@example.com)
  Items:
    - Widget A x2    $29.99 ea
    - Widget B x1    $49.99 ea
  Subtotal: $109.97
  Shipping: $9.99
  Total: $119.96
  Tracking: UPS 1Z999AA10123456784
  Created: 2026-02-15
  Updated: 2026-02-18
```

### Inventory Summary
```
Inventory Report:
  SKU         | Product       | In Stock | Low Stock?
  ------------|---------------|----------|----------
  PROD-001    | Widget A      | 145      | No
  PROD-002    | Widget B      | 8        | YES
  PROD-003    | Widget C      | 52       | No

  Total SKUs: 3
  Low Stock Items: 1
```

## Notes

- API URL and key must be configured in env.yaml for remote API mode
- Local JSON mode available as fallback (no API needed)
- Order statuses follow standard e-commerce workflow
- Shipping integration depends on carrier API availability
- All platforms supported (Windows, Linux, Mac)
