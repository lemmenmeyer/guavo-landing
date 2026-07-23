// Thin Monday GraphQL client for use inside Vercel serverless functions.
//
// Only exposes the surface the decline-email flow needs:
//   * fetchItem(itemId)   → item snapshot with column values + assets
//   * updateStatusIndex(itemId, columnId, index)
//   * updateText(itemId, columnId, text)
//   * postUpdate(itemId, body)
//
// Env: MONDAY_API_TOKEN (personal API v2 token from staura.monday.com).

const API_URL = 'https://api.monday.com/v2';
// change_column_value requires board_id (API-Version 2024-01). Guavo Pipeline
// board is fixed; env override kept for safety.
const BOARD_ID = process.env.MONDAY_BOARD_ID || '18416816603';

async function mondayFetch(query, variables) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error('MONDAY_API_TOKEN is not set');
  const resp = await fetch(API_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': token,
      'API-Version':   '2024-01',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Monday API HTTP ${resp.status}: ${errText.slice(0, 400)}`);
  }
  const json = await resp.json();
  if (json.errors) {
    throw new Error(`Monday GraphQL error: ${JSON.stringify(json.errors).slice(0, 600)}`);
  }
  return json.data;
}

// Fetch a single item with all its column values + assets. Returns:
//   {
//     id, name, boardId,
//     columns: { [column_id]: { text, value } },
//     assets:  [{ id, name, file_extension, file_size, url, public_url }]
//   }
async function fetchItem(itemId) {
  const data = await mondayFetch(`
    query FetchItem($ids: [ID!]!) {
      items(ids: $ids) {
        id
        name
        board { id }
        column_values {
          id
          text
          value
        }
        assets {
          id
          name
          file_extension
          file_size
          url
          public_url
        }
      }
    }
  `, { ids: [String(itemId)] });
  const item = (data.items || [])[0];
  if (!item) return null;
  const columns = Object.fromEntries(
    (item.column_values || []).map(c => [c.id, { text: c.text, value: c.value }])
  );
  return {
    id:      item.id,
    name:    item.name,
    boardId: item.board?.id,
    columns,
    assets:  item.assets || [],
  };
}

async function updateStatusIndex(itemId, columnId, index) {
  return mondayFetch(`
    mutation SetStatus($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(
        board_id:  $boardId,
        item_id:   $itemId,
        column_id: $columnId,
        value:     $value
      ) { id }
    }
  `, {
    boardId:  BOARD_ID,
    itemId:   String(itemId),
    columnId,
    value:    JSON.stringify({ index: Number(index) }),
  });
}

async function updateStatusLabel(itemId, columnId, label) {
  return mondayFetch(`
    mutation SetStatusLabel($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(
        board_id:  $boardId,
        item_id:   $itemId,
        column_id: $columnId,
        value:     $value
      ) { id }
    }
  `, {
    boardId:  BOARD_ID,
    itemId:   String(itemId),
    columnId,
    value:    JSON.stringify({ label }),
  });
}

async function updateText(itemId, columnId, text) {
  return mondayFetch(`
    mutation SetText($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(
        board_id:  $boardId,
        item_id:   $itemId,
        column_id: $columnId,
        value:     $value
      ) { id }
    }
  `, {
    boardId:  BOARD_ID,
    itemId:   String(itemId),
    columnId,
    value:    JSON.stringify(String(text)),
  });
}

// Post an update (comment) on the item. Body is HTML — Monday accepts basic
// tags; keep it simple so the audit trail is human-readable.
async function postUpdate(itemId, body) {
  return mondayFetch(`
    mutation PostUpdate($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) { id }
    }
  `, {
    itemId: String(itemId),
    body:   String(body),
  });
}

module.exports = {
  fetchItem,
  updateStatusIndex,
  updateStatusLabel,
  updateText,
  postUpdate,
};
