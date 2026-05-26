import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { 
  Building2, 
  CheckCircle2, 
  XCircle, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  ChevronsUpDown,
  Send,
  Sparkles,
  Layers
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  Cell, 
  PieChart, 
  Pie
} from 'recharts';
import data from './properties.json';
import { askGemini, computeDataSummary } from './services/geminiService';

const CITIES = [
  "Delhi", "Mumbai", "Pune", "Bengaluru", "Chennai", 
  "Hyderabad", "Ahmedabad", "Kolkata", "Jaipur", "Lucknow"
];

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#a855f7'];

// Quick-ask suggested questions for testing
const SUGGESTIONS = [
  "Which city has the highest total collection?",
  "How many properties are rejected in Mumbai?",
  "What percentage of Delhi properties are approved?",
  "Which city has the most pending properties?",
  "Compare total registrations between Pune and Jaipur."
];

export default function App() {
  // --- STATE VARIABLES ---
  const [selectedTenant, setSelectedTenant] = useState('All');
  const [activeTab, setActiveTab] = useState('revenue'); // 'revenue' | 'status' | 'type'
  
  // Chat State
  const [chatHistory, setChatHistory] = useState([
    { 
      sender: 'ai', 
      text: "👋 Namaste! I am your UPYOG Property Tax Analytics Assistant.\n\nAsk me any question about the property data, collections, approval statistics, or individual owners across our 10 city tenants. Select a quick chip below or type your custom query!",
      timestamp: new Date()
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // Data Explorer Table State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  
  // Sorting State
  const [sortField, setSortField] = useState('property_id'); // default sorting field
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' | 'desc'
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // --- CONFETTI EFFECT ---
  const triggerConfetti = (type = 'success') => {
    if (type === 'success') {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#6366f1', '#10b981', '#f59e0b']
      });
    } else {
      confetti({
        particleCount: 40,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#6366f1', '#a855f7']
      });
      confetti({
        particleCount: 40,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#6366f1', '#a855f7']
      });
    }
  };

  // --- DYNAMIC CALCULATIONS ---
  
  // Filter core dataset by Selected City Dropdown
  const tenantFilteredData = selectedTenant === 'All' 
    ? data 
    : data.filter(item => item.tenant === selectedTenant);

  // Compute live KPIs
  const totalRegistered = tenantFilteredData.length;
  const totalApproved = tenantFilteredData.filter(item => item.status === 'Approved').length;
  const totalRejected = tenantFilteredData.filter(item => item.status === 'Rejected').length;
  const totalPending = tenantFilteredData.filter(item => item.status === 'Pending').length;
  const totalCollection = tenantFilteredData.reduce((sum, item) => sum + (Number(item.collection_inr) || 0), 0);

  // Format currency in Indian Style (INR)
  const formatINR = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(value);
  };

  // Format dynamic numbers nicely
  const formatCompactNumber = (value) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    return formatINR(value);
  };

  // --- RECHARTS PREPARATION ---
  
  // 1. All-10-Cities Comparison Chart (Revenue and Status Breakdowns)
  const cityComparisonData = CITIES.map(city => {
    const cityRecords = data.filter(item => item.tenant === city);
    const collection = cityRecords.reduce((sum, item) => sum + (Number(item.collection_inr) || 0), 0);
    const approved = cityRecords.filter(item => item.status === 'Approved').length;
    const rejected = cityRecords.filter(item => item.status === 'Rejected').length;
    const pending = cityRecords.filter(item => item.status === 'Pending').length;
    
    return {
      name: city,
      collection: Math.round(collection),
      approved,
      rejected,
      pending,
      registered: cityRecords.length
    };
  });

  // 2. Property Type Distribution (dynamic based on tenant filter)
  const propertyTypeDistribution = (() => {
    const distribution = {};
    tenantFilteredData.forEach(item => {
      distribution[item.property_type] = (distribution[item.property_type] || 0) + 1;
    });
    return Object.entries(distribution).map(([name, value]) => ({ name, value }));
  })();

  // --- DATA EXPLORER FILTER & SORT & PAGINATION ---
  
  // Filter explorer table rows
  const explorerFilteredData = data.filter(item => {
    // Dropdown tenant filter
    const matchesTenant = selectedTenant === 'All' || item.tenant === selectedTenant;
    // Status filter
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
    // Property Type filter
    const matchesType = typeFilter === 'All' || item.property_type === typeFilter;
    // Free text search
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      item.owner_name.toLowerCase().includes(searchLower) ||
      item.property_id.toLowerCase().includes(searchLower) ||
      item.address.toLowerCase().includes(searchLower) ||
      item.ward.toLowerCase().includes(searchLower);

    return matchesTenant && matchesStatus && matchesType && matchesSearch;
  });

  // Sort filtered rows
  const sortedExplorerData = [...explorerFilteredData].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    // Handle numerical sorts
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    }

    // Default string sorts
    valA = String(valA).toLowerCase();
    valB = String(valB).toLowerCase();
    
    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Paginated Rows
  const totalExplorerRows = sortedExplorerData.length;
  const totalPages = Math.ceil(totalExplorerRows / rowsPerPage) || 1;
  const activePage = Math.max(1, Math.min(currentPage, totalPages));
  const indexOfLastRow = activePage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentExplorerRows = sortedExplorerData.slice(indexOfFirstRow, indexOfLastRow);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Scroll Chat to Bottom
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, isTyping]);

  // Handle City Change Dropdown
  const handleCityChange = (e) => {
    const val = e.target.value;
    setSelectedTenant(val);
    setCurrentPage(1);
    triggerConfetti(val === 'All' ? 'double' : 'success');
  };

  // --- AI ANSWERING CONTROLLER ---
  
  // Smart local database query assistant in case Gemini Key isn't loaded in Vite .env
  const handleLocalQueryFallback = (message) => {
    const summary = computeDataSummary(data);
    const msg = message.toLowerCase();
    
    if (msg.includes('highest total collection') || msg.includes('highest collection') || msg.includes('top collector') || msg.includes('most revenue')) {
      const formattedColl = Number(summary.maxCollection).toLocaleString('en-IN', { minimumFractionDigits: 2 });
      return `Based on our current dataset, **${summary.topCollectionCity}** is the highest collecting city tenant, generating a whopping **₹${formattedColl}** in tax collection out of the total ₹${Number(summary.totalCollection).toLocaleString('en-IN')} collected platform-wide!`;
    }
    
    if (msg.includes('rejected in mumbai')) {
      const mum = summary.cities.find(c => c.name === 'Mumbai');
      return `In **Mumbai**, there are exactly **${mum?.rejected || 0} rejected** properties out of ${mum?.registered || 0} registered applications, which accounts for a rejection rate of **${mum?.rejectionRate || '0%'}**.`;
    }
    
    if (msg.includes('percentage') && msg.includes('delhi') && msg.includes('approved')) {
      const del = summary.cities.find(c => c.name === 'Delhi');
      return `In **Delhi City**, exactly **${del?.approved || 0}** out of **${del?.registered || 0}** properties have been approved. This represents an approval percentage of **${del?.approvalRate || '0%'}**!`;
    }
    
    if (msg.includes('most pending') || msg.includes('highest pending')) {
      return `The city with the highest volume of pending applications is **${summary.topPendingCity}**, with **${summary.maxPending} pending** properties awaiting approval.`;
    }
    
    if (msg.includes('compare') && msg.includes('pune') && msg.includes('jaipur')) {
      const pune = summary.cities.find(c => c.name === 'Pune');
      const jai = summary.cities.find(c => c.name === 'Jaipur');
      return `Here is a side-by-side comparison between **Pune** and **Jaipur** property tax metrics:
      
<table class="markdown-table">
  <thead>
    <tr>
      <th>Metric</th>
      <th>Pune</th>
      <th>Jaipur</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Total Registered</strong></td>
      <td>${pune?.registered} properties</td>
      <td>${jai?.registered} properties</td>
    </tr>
    <tr>
      <td><strong>Approved Status</strong></td>
      <td>${pune?.approved} (${pune?.approvalRate})</td>
      <td>${jai?.approved} (${jai?.approvalRate})</td>
    </tr>
    <tr>
      <td><strong>Rejected Status</strong></td>
      <td>${pune?.rejected} (${pune?.rejectionRate})</td>
      <td>${jai?.rejected} (${jai?.rejectionRate})</td>
    </tr>
    <tr>
      <td><strong>Pending Review</strong></td>
      <td>${pune?.pending} (${pune?.pendingRate})</td>
      <td>${jai?.pending} (${jai?.pendingRate})</td>
    </tr>
    <tr>
      <td><strong>Total Collection</strong></td>
      <td><strong>₹${Number(pune?.collection).toLocaleString('en-IN')}</strong></td>
      <td><strong>₹${Number(jai?.collection).toLocaleString('en-IN')}</strong></td>
    </tr>
  </tbody>
</table>

**Analyst Insight:**
- **${pune?.registered > jai?.registered ? 'Pune' : 'Jaipur'}** holds more active property records on the platform.
- **${Number(pune?.collection) > Number(jai?.collection) ? 'Pune' : 'Jaipur'}** dominates in revenue collection.`;
    }

    // Default response using local dataset stats
    return `Hello! I noticed you don't have a Google Gemini API Key configured in your \`.env\` file yet, but I can still answer using our local database analyzer!\n\nHere is a quick overview of our dataset of **1,000 properties** across **10 cities**:\n\n* **Total Platform Collection**: ₹${Number(summary.totalCollection).toLocaleString('en-IN')}\n* **Top Performing City**: ${summary.topCollectionCity} (Collected ₹${Number(summary.maxCollection).toLocaleString('en-IN')})\n* **Highest Registrations**: ${summary.topRegCity} (${summary.maxReg} properties)\n* **Most Pending Approvals**: ${summary.topPendingCity} (${summary.maxPending} properties)\n\n*To enable advanced semantic search and arbitrary property detail query support, please setup your \`VITE_GEMINI_API_KEY\`!*`;
  };

  const handleSendMessage = async (msgText) => {
    if (!msgText.trim()) return;

    const userMsg = {
      sender: 'user',
      text: msgText,
      timestamp: new Date()
    };

    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setIsTyping(true);

    try {
      // Direct call to Gemini service using local import
      const reply = await askGemini(chatHistory, msgText, data);
      
      // Parse markdown tables inside response to clean HTML style if present
      const processedReply = reply
        .replace(/\|/g, '│') // standard markdown tables format cleanup
        .replace(/(\n│[^\n]+│\n)+/g, (match) => {
          // parse simple markdown tables to clean visual layouts
          const rows = match.trim().split('\n').filter(Boolean);
          let html = '<table class="markdown-table">';
          rows.forEach((r, idx) => {
            const cells = r.split('│').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
            if (idx === 1) return; // separator row e.g. |---|---|
            html += '<tr>';
            cells.forEach(c => {
              html += idx === 0 ? `<th>${c}</th>` : `<td>${c}</td>`;
            });
            html += '</tr>';
          });
          html += '</table>';
          return html;
        });

      setChatHistory(prev => [...prev, {
        sender: 'ai',
        text: processedReply,
        timestamp: new Date()
      }]);
      triggerConfetti('ai');
    } catch (err) {
      console.warn('API call failed or environment key not found. Triggering advanced mathematical fallback...', err.message);
      
      // Smart Fallback
      setTimeout(() => {
        const fallbackText = handleLocalQueryFallback(msgText);
        setChatHistory(prev => [...prev, {
          sender: 'ai',
          text: fallbackText,
          timestamp: new Date()
        }]);
        triggerConfetti('ai');
      }, 700);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="dashboard-container">
      {/* --- HEADER --- */}
      <header className="dashboard-header animate-fade-in">
        <div className="logo-section">
          <div className="logo-icon">U</div>
          <div className="brand-info">
            <h1>UPYOG Analytics</h1>
            <p>Property Tax Management Platform</p>
          </div>
        </div>

        <div className="filter-section">
          <label className="filter-label" htmlFor="tenant-dropdown">Tenant City:</label>
          <div className="custom-select-wrapper">
            <select 
              id="tenant-dropdown"
              className="custom-select" 
              value={selectedTenant}
              onChange={handleCityChange}
            >
              <option value="All">All Cities (Platform)</option>
              {CITIES.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
            <ChevronDown size={16} className="custom-select-arrow" />
          </div>
        </div>
      </header>

      {/* --- KPI PANEL --- */}
      <section className="kpi-grid">
        {/* KPI 1: Registered */}
        <div className="kpi-card animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="kpi-details">
            <h3>Registered Properties</h3>
            <div className="kpi-value">{totalRegistered.toLocaleString('en-IN')}</div>
          </div>
          <div className="kpi-icon-container">
            <Building2 size={24} />
          </div>
        </div>

        {/* KPI 2: Approved */}
        <div className="kpi-card approved animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="kpi-details">
            <h3>Approved Applications</h3>
            <div className="kpi-value">{totalApproved.toLocaleString('en-IN')}</div>
          </div>
          <div className="kpi-icon-container">
            <CheckCircle2 size={24} />
          </div>
        </div>

        {/* KPI 3: Rejected */}
        <div className="kpi-card rejected animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <div className="kpi-details">
            <h3>Rejected Applications</h3>
            <div className="kpi-value">{totalRejected.toLocaleString('en-IN')}</div>
          </div>
          <div className="kpi-icon-container">
            <XCircle size={24} />
          </div>
        </div>

        {/* KPI 4: Total Collection */}
        <div className="kpi-card collection animate-fade-in" style={{ animationDelay: '0.4s' }}>
          <div className="kpi-details">
            <h3>Total Collection (INR)</h3>
            <div className="kpi-value">{formatCompactNumber(totalCollection)}</div>
          </div>
          <div className="kpi-icon-container">
            <span style={{ fontSize: '20px', fontWeight: '800' }}>₹</span>
          </div>
        </div>
      </section>

      {/* --- MAIN GRID (Charts + Chat) --- */}
      <section className="dashboard-main-grid">
        
        {/* Visualizations Card */}
        <div className="glass-card analytics-card animate-fade-in" style={{ animationDelay: '0.5s' }}>
          <div className="card-title-section">
            <div>
              <h2>
                <Layers size={18} style={{ color: 'var(--primary)' }} />
                Visualizations
              </h2>
              <div className="card-subtitle">
                {selectedTenant === 'All' ? 'Platform wide tenant metrics' : `${selectedTenant} distribution & comparison`}
              </div>
            </div>

            {/* Quick Summary Badge */}
            <div className="status-badge approved" style={{ textTransform: 'none', fontWeight: '500' }}>
              Pending: {totalPending} properties
            </div>
          </div>

          {/* Visualization Tab Selectors */}
          <div className="tabs-list">
            <button 
              className={`tab-btn ${activeTab === 'revenue' ? 'active' : ''}`}
              onClick={() => setActiveTab('revenue')}
            >
              Revenue comparison
            </button>
            <button 
              className={`tab-btn ${activeTab === 'status' ? 'active' : ''}`}
              onClick={() => setActiveTab('status')}
            >
              Application status
            </button>
            <button 
              className={`tab-btn ${activeTab === 'type' ? 'active' : ''}`}
              onClick={() => setActiveTab('type')}
            >
              Property type distribution
            </button>
          </div>

          {/* Chart Rendering Panel */}
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              {activeTab === 'revenue' ? (
                // 1. Revenue Collection Bar Chart
                <BarChart data={cityComparisonData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                  <XAxis 
                    dataKey="name" 
                    stroke="var(--text-secondary)" 
                    fontSize={11}
                    tickLine={false} 
                  />
                  <YAxis 
                    stroke="var(--text-secondary)" 
                    fontSize={10}
                    tickLine={false}
                    tickFormatter={(val) => `₹${(val / 100000).toFixed(0)}L`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(11, 15, 25, 0.9)', 
                      borderColor: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                    formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Total Collection']}
                  />
                  <Bar dataKey="collection" radius={[6, 6, 0, 0]}>
                    {cityComparisonData.map((entry, index) => {
                      const isSelected = selectedTenant === entry.name || selectedTenant === 'All';
                      return (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={isSelected ? 'url(#primaryGradient)' : 'rgba(99, 102, 241, 0.15)'}
                          stroke={isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.05)'}
                          strokeWidth={1}
                        />
                      );
                    })}
                  </Bar>
                  <defs>
                    <linearGradient id="primaryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.9}/>
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.8}/>
                    </linearGradient>
                  </defs>
                </BarChart>
              ) : activeTab === 'status' ? (
                // 2. Status Grouped Bar Chart
                <BarChart data={cityComparisonData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                  <XAxis 
                    dataKey="name" 
                    stroke="var(--text-secondary)" 
                    fontSize={11}
                    tickLine={false} 
                  />
                  <YAxis stroke="var(--text-secondary)" fontSize={10} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(11, 15, 25, 0.9)', 
                      borderColor: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                  
                  {/* Visualizing Stacked or Grouped bar fields */}
                  <Bar dataKey="approved" name="Approved" fill="#10b981" radius={[3, 3, 0, 0]} opacity={selectedTenant === 'All' ? 0.9 : 0.4}>
                    {cityComparisonData.map((entry, index) => (
                      <Cell key={`cell-${index}`} opacity={selectedTenant === 'All' || selectedTenant === entry.name ? 1.0 : 0.2} />
                    ))}
                  </Bar>
                  <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[3, 3, 0, 0]} opacity={selectedTenant === 'All' ? 0.9 : 0.4}>
                    {cityComparisonData.map((entry, index) => (
                      <Cell key={`cell-${index}`} opacity={selectedTenant === 'All' || selectedTenant === entry.name ? 1.0 : 0.2} />
                    ))}
                  </Bar>
                  <Bar dataKey="rejected" name="Rejected" fill="#ef4444" radius={[3, 3, 0, 0]} opacity={selectedTenant === 'All' ? 0.9 : 0.4}>
                    {cityComparisonData.map((entry, index) => (
                      <Cell key={`cell-${index}`} opacity={selectedTenant === 'All' || selectedTenant === entry.name ? 1.0 : 0.2} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                // 3. Property Type Pie/Donut Chart
                <PieChart>
                  <Pie
                    data={propertyTypeDistribution}
                    cx="50%"
                    cy="45%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={{ stroke: 'rgba(255, 255, 255, 0.15)', strokeWidth: 1 }}
                  >
                    {propertyTypeDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(11, 15, 25, 0.9)', 
                      borderColor: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* --- AI CHAT ASSISTANT PANEL --- */}
        <div className="glass-card chat-card animate-fade-in" style={{ animationDelay: '0.6s' }}>
          <div className="card-title-section">
            <div>
              <h2>
                <Sparkles size={18} style={{ color: '#a855f7' }} />
                Ask UPYOG AI
              </h2>
              <div className="card-subtitle">Conversational tax database analyst</div>
            </div>
            
            <div className="status-badge" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
              Online
            </div>
          </div>

          <div className="chat-container">
            {/* Chat Messages */}
            <div className="chat-messages-container">
              {chatHistory.map((msg, index) => (
                <div key={index} className={`chat-message ${msg.sender === 'user' ? 'user' : 'ai'}`}>
                  <div className="chat-avatar">
                    {msg.sender === 'user' ? 'U' : 'AI'}
                  </div>
                  <div 
                    className="chat-bubble"
                    dangerouslySetInnerHTML={{ __html: msg.text }}
                  />
                </div>
              ))}
              
              {/* Animated AI Typing Indicator */}
              {isTyping && (
                <div className="chat-message ai">
                  <div className="chat-avatar">AI</div>
                  <div className="typing-indicator">
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Quick Ask Suggestion Chips */}
            <div className="chat-suggestions">
              {SUGGESTIONS.map((sug, idx) => (
                <button 
                  key={idx} 
                  className="suggestion-chip"
                  onClick={() => handleSendMessage(sug)}
                  disabled={isTyping}
                >
                  {sug}
                </button>
              ))}
            </div>

            {/* Message input form */}
            <form 
              className="chat-input-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(chatInput);
              }}
            >
              <input 
                type="text" 
                className="chat-input"
                placeholder="Ask a question about cities, owners, wards, collections..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isTyping}
              />
              <button 
                type="submit" 
                className="chat-send-btn"
                disabled={isTyping || !chatInput.trim()}
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>

      </section>

      {/* --- DATA EXPLORER RAW TABLE SECTION --- */}
      <section className="glass-card data-explorer-card animate-fade-in" style={{ animationDelay: '0.7s' }}>
        <div className="card-title-section" style={{ marginBottom: '12px' }}>
          <div>
            <h2>
              <Building2 size={18} style={{ color: 'var(--success)' }} />
              Raw Data Explorer
            </h2>
            <div className="card-subtitle">
              Interactive granular property registry ({totalExplorerRows} items matching)
            </div>
          </div>
        </div>

        {/* Search controls */}
        <div className="explorer-controls">
          <div className="search-wrapper">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              className="search-input"
              placeholder="Search by owner name, ID, address..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="explorer-filters">
            {/* Status Selector */}
            <select 
              className="mini-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="All">All Statuses</option>
              <option value="Approved">Approved</option>
              <option value="Pending">Pending</option>
              <option value="Rejected">Rejected</option>
            </select>

            {/* Property Type Selector */}
            <select 
              className="mini-select"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="All">All Types</option>
              <option value="Residential">Residential</option>
              <option value="Commercial">Commercial</option>
              <option value="Industrial">Industrial</option>
              <option value="Agricultural">Agricultural</option>
              <option value="Mixed Use">Mixed Use</option>
            </select>
          </div>
        </div>

        {/* Data Grid Table */}
        <div className="table-wrapper">
          <table className="premium-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('property_id')}>
                  <div className="th-content">
                    Property ID
                    {sortField === 'property_id' ? (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={12} className="th-sort-icon" />}
                  </div>
                </th>
                <th onClick={() => handleSort('owner_name')}>
                  <div className="th-content">
                    Owner Name
                    {sortField === 'owner_name' ? (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={12} className="th-sort-icon" />}
                  </div>
                </th>
                <th onClick={() => handleSort('tenant')}>
                  <div className="th-content">
                    City
                    {sortField === 'tenant' ? (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={12} className="th-sort-icon" />}
                  </div>
                </th>
                <th onClick={() => handleSort('ward')}>
                  <div className="th-content">
                    Ward
                    {sortField === 'ward' ? (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={12} className="th-sort-icon" />}
                  </div>
                </th>
                <th onClick={() => handleSort('property_type')}>
                  <div className="th-content">
                    Type
                    {sortField === 'property_type' ? (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={12} className="th-sort-icon" />}
                  </div>
                </th>
                <th onClick={() => handleSort('annual_tax_inr')}>
                  <div className="th-content">
                    Annual Tax
                    {sortField === 'annual_tax_inr' ? (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={12} className="th-sort-icon" />}
                  </div>
                </th>
                <th onClick={() => handleSort('collection_inr')}>
                  <div className="th-content">
                    Collection
                    {sortField === 'collection_inr' ? (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={12} className="th-sort-icon" />}
                  </div>
                </th>
                <th onClick={() => handleSort('status')}>
                  <div className="th-content">
                    Status
                    {sortField === 'status' ? (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={12} className="th-sort-icon" />}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {currentExplorerRows.length > 0 ? (
                currentExplorerRows.map(row => (
                  <tr key={row.property_id}>
                    <td style={{ color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 'bold' }}>{row.property_id}</td>
                    <td>{row.owner_name}</td>
                    <td>{row.tenant}</td>
                    <td>{row.ward}</td>
                    <td>{row.property_type}</td>
                    <td>{formatINR(row.annual_tax_inr)}</td>
                    <td style={{ fontWeight: 'bold', color: row.status === 'Approved' ? 'var(--success)' : 'inherit' }}>
                      {formatINR(row.collection_inr)}
                    </td>
                    <td>
                      <span className={`status-badge ${row.status.toLowerCase()}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>
                    No property applications match your active search filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        <div className="pagination-container">
          <div className="pagination-info">
            Showing <strong>{totalExplorerRows > 0 ? indexOfFirstRow + 1 : 0}</strong> to <strong>{Math.min(indexOfLastRow, totalExplorerRows)}</strong> of <strong>{totalExplorerRows}</strong> properties
          </div>

          <div className="pagination-buttons">
            <button 
              className="page-btn"
              onClick={() => setCurrentPage(1)}
              disabled={activePage === 1}
            >
              First
            </button>
            <button 
              className="page-btn"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={activePage === 1}
            >
              Prev
            </button>
            <button className="page-btn" style={{ borderColor: 'var(--border-glow)', color: 'white', cursor: 'default' }}>
              Page {activePage} of {totalPages}
            </button>
            <button 
              className="page-btn"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={activePage === totalPages}
            >
              Next
            </button>
            <button 
              className="page-btn"
              onClick={() => setCurrentPage(totalPages)}
              disabled={activePage === totalPages}
            >
              Last
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
