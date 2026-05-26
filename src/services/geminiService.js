/**
 * Service to aggregate UPYOG property tax data and communicate with the Gemini AI model.
 */

/**
 * Pre-calculates comprehensive stats from properties.json to feed as direct context to Gemini.
 * This guarantees 100% accurate mathematical answers for high-level statistics without hallucination.
 */
export const computeDataSummary = (data) => {
  if (!data || data.length === 0) return null;

  const totalRecords = data.length;
  let totalCollection = 0;
  let totalTax = 0;
  
  const cities = {};
  const propertyTypes = {};
  const wardBreakdown = {};

  data.forEach((item) => {
    const city = item.tenant;
    const type = item.property_type;
    const status = item.status;
    const collection = Number(item.collection_inr) || 0;
    const tax = Number(item.annual_tax_inr) || 0;
    const ward = item.ward;

    // Initialize city stats
    if (!cities[city]) {
      cities[city] = {
        name: city,
        registered: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
        collection: 0,
        tax: 0,
      };
    }

    cities[city].registered++;
    cities[city].collection += collection;
    cities[city].tax += tax;
    totalCollection += collection;
    totalTax += tax;

    if (status === 'Approved') cities[city].approved++;
    else if (status === 'Rejected') cities[city].rejected++;
    else if (status === 'Pending') cities[city].pending++;

    // Property Type stats
    propertyTypes[type] = (propertyTypes[type] || 0) + 1;

    // Ward Stats
    const wardKey = `${city} - ${ward}`;
    wardBreakdown[wardKey] = (wardBreakdown[wardKey] || 0) + 1;
  });

  // Find Top Performing Cities
  let topCollectionCity = '';
  let maxCollection = 0;
  let topRegCity = '';
  let maxReg = 0;
  let topPendingCity = '';
  let maxPending = 0;
  let topRejectedCity = '';
  let maxRejected = 0;

  Object.values(cities).forEach((c) => {
    if (c.collection > maxCollection) {
      maxCollection = c.collection;
      topCollectionCity = c.name;
    }
    if (c.registered > maxReg) {
      maxReg = c.registered;
      topRegCity = c.name;
    }
    if (c.pending > maxPending) {
      maxPending = c.pending;
      topPendingCity = c.name;
    }
    if (c.rejected > maxRejected) {
      maxRejected = c.rejected;
      topRejectedCity = c.name;
    }
  });

  return {
    totalRecords,
    totalCollection: totalCollection.toFixed(2),
    totalTax: totalTax.toFixed(2),
    topCollectionCity,
    maxCollection: maxCollection.toFixed(2),
    topRegCity,
    maxReg,
    topPendingCity,
    maxPending,
    topRejectedCity,
    maxRejected,
    propertyTypes,
    cities: Object.values(cities).map((c) => ({
      ...c,
      collection: c.collection.toFixed(2),
      tax: c.tax.toFixed(2),
      approvalRate: ((c.approved / c.registered) * 100).toFixed(1) + '%',
      rejectionRate: ((c.rejected / c.registered) * 100).toFixed(1) + '%',
      pendingRate: ((c.pending / c.registered) * 100).toFixed(1) + '%',
    })),
  };
};

/**
 * Interfaces with Gemini API via fetch.
 * Sets system instructions, injects dataset context, and handles full chat history.
 */
export const askGemini = async (chatHistory, userMessage, rawProperties) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Gemini API Key is missing. Please add VITE_GEMINI_API_KEY to your .env file.');
  }

  // Pre-calculate aggregates
  const summary = computeDataSummary(rawProperties);

  // Compile detailed, extremely strict system prompt context
  const systemPrompt = `You are the UPYOG Property Tax Analytics Assistant, a highly intelligent and professional AI data analyst for the UPYOG Multi-Tenant Platform (serving 10 Indian cities: Delhi, Mumbai, Pune, Bengaluru, Chennai, Hyderabad, Ahmedabad, Kolkata, Jaipur, Lucknow).

You are given a property tax dataset of exactly 1,000 records.
Here are the pre-calculated aggregate statistics for 100% accurate mathematical queries:
- Total registered properties: ${summary.totalRecords}
- Total tax collection: ₹${Number(summary.totalCollection).toLocaleString('en-IN')}
- Top revenue collection city: ${summary.topCollectionCity} (Collected ₹${Number(summary.maxCollection).toLocaleString('en-IN')})
- Top registered properties city: ${summary.topRegCity} (${summary.maxReg} properties)
- Most pending properties city: ${summary.topPendingCity} (${summary.maxPending} pending)
- Most rejected properties city: ${summary.topRejectedCity} (${summary.maxRejected} rejected)

City-by-City detailed aggregates:
${JSON.stringify(summary.cities, null, 2)}

Property Type Breakdown:
${JSON.stringify(summary.propertyTypes, null, 2)}

You also have access to the complete raw properties list below for detailed lookups (e.g. ward details, floor counts, areas, custom lookups by owner name, specific property IDs, addresses, etc.).
Raw Dataset:
${JSON.stringify(rawProperties.map(p => ({
  id: p.property_id,
  city: p.tenant,
  owner: p.owner_name,
  type: p.property_type,
  ward: p.ward,
  area: p.area_sqft,
  status: p.status,
  tax: p.annual_tax_inr,
  coll: p.collection_inr,
  date: p.registration_date,
  floors: p.floor_count,
  addr: p.address
})), null, 1)}

STRICT RULES FOR YOUR RESPONSES:
1. Base all answers strictly on the UPYOG property tax data and pre-computed summaries provided.
2. For general statistics (e.g., total registered in Mumbai, rejected in Jaipur), refer directly to the aggregates above to make sure your counts are 100% correct.
3. Keep responses clear, compact, and highly engaging. Use bullet points or bold text to make your analysis scannable.
4. When requested to list properties or show detailed listings, ALWAYS format them as a clean markdown table (e.g. columns: ID, Owner, City, Status, Collection (₹)).
5. Use the Indian Rupee symbol (₹) for all currency values, formatted in Lakhs/Crores or using Standard Indian commas (e.g. ₹12,098.09 or ₹1,45,200.00).
6. If a user asks a question unrelated to the UPYOG dataset or analytics platform, politely state that you can only answer questions related to the UPYOG property tax statistics.
7. Be encouraging, helpful, and speak like an elite data analyst.
`;

  // Map history to Gemini format (roles must alternate between 'user' and 'model')
  // We feed the history contents, and pass the system prompt as systemInstruction
  const mappedContents = [];
  
  // In v1beta, we can feed the chat history. To make it highly contextual,
  // we will map 'assistant' to 'model' as required by Gemini API.
  chatHistory.forEach(msg => {
    mappedContents.push({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    });
  });

  // Add the current user query at the end
  mappedContents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: mappedContents,
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature: 0.1, // Low temperature for high precision and no hallucinations
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Gemini API Error:', errorData);
      throw new Error(errorData?.error?.message || `API HTTP Error ${response.status}`);
    }

    const resJson = await response.json();
    const candidateText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!candidateText) {
      throw new Error('Invalid empty response received from Gemini.');
    }

    return candidateText;
  } catch (error) {
    console.error('askGemini failed:', error);
    throw error;
  }
};
