import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();

// Enable CORS for Shopify checkout
app.use(cors({
  origin: true, // Allow all origins (you can restrict this later)
  credentials: true
}));

app.use(express.json());

// replace with your private app token or server-side app session token
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const SHOP = "e-wickstead.myshopify.com";

// Check if required environment variables are set
if (!SHOPIFY_ACCESS_TOKEN) {
  console.error('❌ ERROR: SHOPIFY_ADMIN_API_TOKEN environment variable is not set!');
  console.error('Please create a .env file with: SHOPIFY_ADMIN_API_TOKEN=your_token_here');
  process.exit(1);
}

// 👇 IMPORTANT: replace with the US location ID you want to check
const US_LOCATION_ID = "gid://shopify/Location/82271371501";

app.post('/api/inventory-check', async (req, res) => {
  try {
    const { variantId } = req.body;
    console.log(variantId, "variantId");
    if (!variantId) {
      return res.status(400).json({ error: 'variantId required' });
    }

    // Step 1: get inventoryItemId from variant
    const queryVariant = `
      query($id: ID!) {
        productVariant(id: $id) {
          title
          inventoryItem {
            id
          }
        }
      }
    `;

    const variantResp = await fetch(`https://${SHOP}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: queryVariant, variables: { id: variantId } }),
    });

    const variantData = await variantResp.json();
    const inventoryItemId = variantData?.data?.productVariant?.inventoryItem?.id;
    console.log(variantData, "variantData");
    console.log(inventoryItemId, "inventoryItemId");
    if (!inventoryItemId) {
      return res.json({ inStockAtUS: false });
    }

    // Step 2: check stock at US location using inventoryItem query
    const queryStock = `
      query($itemId: ID!) {
        inventoryItem(id: $itemId) {
          inventoryLevels(first: 10) {
            edges {
              node {
                location {
                  id
                  name
                }
                quantities(names: ["available"]) {
                  name
                  quantity
                }
              }
            }
          }
        }
      }
    `;

    const stockResp = await fetch(`https://${SHOP}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: queryStock,
        variables: { itemId: inventoryItemId },
      }),
    });

    const stockData = await stockResp.json();
    console.log(stockData, "stockData");
    
    // Find the inventory level for the US location
    const inventoryLevels = stockData?.data?.inventoryItem?.inventoryLevels?.edges || [];
    const usLocation = inventoryLevels.find(edge => 
      edge.node.location.id === US_LOCATION_ID
    );
    
    // Get the available quantity for the US location
    let available = 0;
    if (usLocation) {
      const availableQuantity = usLocation.node.quantities.find(q => q.name === 'available');
      available = availableQuantity ? availableQuantity.quantity : 0;
    }
    
    console.log(`Available quantity at US location: ${available}`);
    res.json({ inStockAtUS: available > 0 });
  } catch (err) {
    console.error('Error in /api/inventory-check:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(3000, () => {
  console.log('Backend API running on http://localhost:3000');
});
