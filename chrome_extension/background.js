// Store conversations in Chrome storage
let conversations = [];
let accessToken = null;

// Listen for network requests to capture the access token
chrome.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    if (details.url.includes('chatgpt.com/backend-api')) {
      const headers = details.requestHeaders;
      const authHeader = headers.find(header => header.name.toLowerCase() === 'authorization');
      
      if (authHeader && authHeader.value.startsWith('Bearer ')) {
        accessToken = authHeader.value.substring(7); // Remove 'Bearer ' prefix
        console.log('Captured access token from', details.method, 'request');
      }
    }
  },
  { 
    urls: ['https://chatgpt.com/backend-api/*'],
    types: ['xmlhttprequest']
  },
  ['requestHeaders']
);

// Function to get authorization token
async function getAuthToken() {
  if (!accessToken) {
    throw new Error('No access token found. Please refresh the ChatGPT page and try again.');
  }
  return accessToken;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background script received message:', message);

  if (message.action === 'getConversations') {
    fetchConversations()
      .then(conversations => {
        console.log('Fetched conversations:', conversations);
        sendResponse({ success: true, conversations });
      })
      .catch(error => {
        console.error('Error fetching conversations:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Will respond asynchronously
  }

  if (message.action === 'deleteConversations') {
    deleteConversations(message.conversationIds)
      .then(() => {
        console.log('Successfully deleted conversations');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error deleting conversations:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Will respond asynchronously
  }
});

async function fetchConversations() {
  try {
    const authToken = await getAuthToken();
    
    if (!authToken) {
      throw new Error('No authorization token found');
    }

    let allConversations = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      console.log(`Fetching conversations from offset ${offset}`);
      const response = await fetch(`https://chatgpt.com/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'Accept-Language': 'en-IN,en;q=0.9,hi-IN;q=0.8,hi;q=0.7,en-US;q=0.6,mr-IN;q=0.5,mr;q=0.4,en-GB;q=0.3',
          'Origin': 'https://chatgpt.com',
          'Referer': 'https://chatgpt.com/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch conversations: ${response.status}`);
      }

      const data = await response.json();
      
      // If no items returned, we've reached the end
      if (!data.items || data.items.length === 0) {
        console.log('No more conversations found');
        break;
      }

      const conversations = data.items.map(item => ({
        id: item.id,
        title: item.title || 'Untitled Conversation',
        timestamp: item.update_time,
        created_at: item.create_time
      }));

      allConversations = allConversations.concat(conversations);
      console.log(`Fetched ${conversations.length} conversations. Total so far: ${allConversations.length}`);
      
      // Update offset for next batch
      offset += limit;

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Finished fetching all conversations. Total: ${allConversations.length}`);
    return allConversations;
  } catch (error) {
    console.error('Error in fetchConversations:', error);
    throw error;
  }
}

async function deleteConversations(conversationIds) {
  try {
    const authToken = await getAuthToken();
    
    if (!authToken) {
      throw new Error('No authorization token found');
    }

    const deletePromises = conversationIds.map(id =>
      fetch(`https://chatgpt.com/backend-api/conversation/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'Accept-Language': 'en-IN,en;q=0.9,hi-IN;q=0.8,hi;q=0.7,en-US;q=0.6,mr-IN;q=0.5,mr;q=0.4,en-GB;q=0.3',
          'Origin': 'https://chatgpt.com',
          'Referer': `https://chatgpt.com/c/${id}`,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({ is_visible: false })
      })
    );

    const results = await Promise.allSettled(deletePromises);
    const failedDeletions = results.filter(r => r.status === 'rejected');

    if (failedDeletions.length > 0) {
      throw new Error(`Failed to delete ${failedDeletions.length} conversations`);
    }
  } catch (error) {
    console.error('Error in deleteConversations:', error);
    throw error;
  }
} 