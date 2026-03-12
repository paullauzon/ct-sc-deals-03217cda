import { Lead } from "@/types/lead";

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date("2026-03-03");
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function extractCompany(urlOrEmail: string): string {
  if (!urlOrEmail) return "";
  try {
    if (urlOrEmail.includes("@")) {
      const domain = urlOrEmail.split("@")[1];
      if (["gmail.com", "hotmail.com", "icloud.com", "outlook.com", "yahoo.com", "proton.me", "mozmail.com", "cornell.edu", "umd.edu", "wharton.upenn.edu", "duke.edu"].includes(domain)) return "";
      return domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
    }
    const url = new URL(urlOrEmail.startsWith("http") ? urlOrEmail : `https://${urlOrEmail}`);
    const parts = url.hostname.replace("www.", "").split(".");
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  } catch {
    return "";
  }
}

function makeSCLead(
  idx: number,
  source: "SC Intro Call Form" | "SC Free Targets Form",
  r: { date: string; firstName: string; lastName: string; email: string; phone: string; company: string; role: string; message: string; hearAboutUs: string; acquisitionStrategy?: string; targetCriteria?: string; targetRevenue?: string; geography?: string; currentSourcing?: string }
): Lead {
  const name = `${r.firstName} ${r.lastName}`.trim();
  return {
    id: `SC-${source === "SC Intro Call Form" ? "I" : "T"}-${String(idx + 1).padStart(3, "0")}`,
    brand: "SourceCo",
    name,
    email: r.email,
    phone: r.phone.replace(/^'+/, "").replace(/'+$/, ""),
    company: r.company || extractCompany(r.email),
    companyUrl: "",
    role: r.role,
    source,
    dateSubmitted: r.date,
    message: r.message,
    dealsPlanned: "",
    stage: "New Lead",
    serviceInterest: "TBD",
    dealValue: 0,
    assignedTo: "",
    meetingDate: "",
    meetingSetDate: "",
    hoursToMeetingSet: null,
    daysInCurrentStage: daysSince(r.date),
    stageEnteredDate: r.date,
    closeReason: "",
    closedDate: "",
    notes: "",
    lastContactDate: "",
    nextFollowUp: "",
    priority: "Medium",
    meetingOutcome: "",
    forecastCategory: "",
    icpFit: "",
    wonReason: "",
    lostReason: "",
    targetCriteria: r.targetCriteria || "",
    targetRevenue: r.targetRevenue || "",
    geography: r.geography || "",
    currentSourcing: r.currentSourcing || "",
    isDuplicate: false,
    duplicateOf: "",
    hearAboutUs: r.hearAboutUs,
    acquisitionStrategy: r.acquisitionStrategy || "",
    buyerType: "",
    meetings: [],
    submissions: [],
    subscriptionValue: 0,
    billingFrequency: "",
    contractStart: "",
    contractEnd: "",
    firefliesUrl: "",
    firefliesTranscript: "",
    firefliesSummary: "",
    firefliesNextSteps: "",
    stage1Score: null,
    stage2Score: null,
    tier: null,
    tierOverride: false,
    enrichmentStatus: "",
  };
}

export function parseSourceCoIntroLeads(): Lead[] {
  const raw = [
    { date: "2026-03-03", firstName: "Abhinav", lastName: "Agrawal", email: "abhinav.agrawal@bankersklub.com", phone: "8527961709", company: "BankersKlub", role: "Business Owner", message: "Discuss partnership opportunities and mutual synergies", hearAboutUs: "Google" },
    { date: "2026-02-26", firstName: "Michael", lastName: "Tindall", email: "michael@moderndistributionnc.com", phone: "5138152522", company: "Modern Distribution", role: "Business Owner", message: "Sourcing deal flow for a new business division in healthcare starting with a platform acquisition", hearAboutUs: "LinkedIn" },
    { date: "2026-02-21", firstName: "Jordi", lastName: "Quevedo-Valls", email: "jordi@valarbrokers.com", phone: "6414511655", company: "Valar Brokers", role: "Advisor / Banker", message: "Getting off-market deals", hearAboutUs: "Here" },
    { date: "2026-02-19", firstName: "Jay", lastName: "Lax", email: "jlax@avalonabagroup.com", phone: "9178642523", company: "Avalon ABA Group", role: "Corporate", message: "Sourcing in the healthcare space specifically ABA Therapy clinics", hearAboutUs: "LinkedIn" },
    { date: "2026-02-09", firstName: "Waranun", lastName: "Wachakorn", email: "ww554@cornell.edu", phone: "9299965732", company: "", role: "Business Owner", message: "Food & Beverage Sector", hearAboutUs: "Google" },
    { date: "2026-02-07", firstName: "Venkat", lastName: "Maganti", email: "venkat@brightpathassociates.com", phone: "2034999457", company: "BrightPath Associates", role: "Family Office", message: "Help to connect with off market businesses", hearAboutUs: "Google" },
    { date: "2026-02-03", firstName: "Tom", lastName: "Newberry", email: "tom.newberry@kilbirniecapital.com", phone: "2032732283", company: "Kilbirnie Capital", role: "Independent Sponsor", message: "One-man independent sponsor looking to outsource deal sourcing to a deal origination shop", hearAboutUs: "LinkedIn" },
    { date: "2026-02-02", firstName: "Anthony", lastName: "Bell", email: "info@solanosolution.com", phone: "954-736-3112", company: "Solano Solution", role: "Individual Investor", message: "Evaluating off-market sourcing for standalone platform acquisition seeking $120K-$180K net cash flow annually", hearAboutUs: "Google" },
    { date: "2026-01-30", firstName: "Will", lastName: "Tuchfarber", email: "wtuchfarber@flexpointford.com", phone: "3123274551", company: "Flexpoint Ford", role: "Private Equity", message: "Market-mapping for roll-up opportunities", hearAboutUs: "Google" },
    { date: "2026-01-22", firstName: "Rodryk", lastName: "Schoenfeld", email: "schoenfeld@industrieconsult.de", phone: "+49 211 86 52 30", company: "IndustrieConsult", role: "Advisor / Banker", message: "M&A consultancy in Düsseldorf interested in AI-supported deal sourcing product", hearAboutUs: "Grok" },
    { date: "2026-01-12", firstName: "Nicholas", lastName: "Tan", email: "tan.zhengyin.nicholas@stengg.com", phone: "+16505079209", company: "ST Engineering", role: "Corporate", message: "Corporate investor looking to deploy growth equity into a profitable business for inorganic growth", hearAboutUs: "Online search" },
    { date: "2026-01-09", firstName: "Katherine", lastName: "Monasebian", email: "katherine@tesseraeholdings.com", phone: "9175534043", company: "Tesserae Holdings", role: "Independent Sponsor", message: "Sourcing Support - tri-state area", hearAboutUs: "Online" },
    { date: "2026-01-09", firstName: "Vidushi", lastName: "Gupta", email: "vidushi.gupta@innovaccer.com", phone: "9522196602", company: "Innovaccer", role: "Corporate", message: "Looking for 3rd party channel partners for identification of potential targets and pipeline building for M&A", hearAboutUs: "Google" },
    { date: "2026-01-07", firstName: "Stuart", lastName: "Hutton", email: "shutton@reppertcapital.com", phone: "7134253775", company: "Reppert Capital", role: "Family Office", message: "I'd like to learn more about your sourcing platform", hearAboutUs: "Google" },
    { date: "2025-12-22", firstName: "Timothy", lastName: "Dolan", email: "tim@woodycreek.partners", phone: "3037178147", company: "Woody Creek Partners", role: "Independent Sponsor", message: "Seeking help generating qualified meetings for initial platform deal", hearAboutUs: "Google" },
    { date: "2025-12-19", firstName: "Jack", lastName: "Harvey", email: "jack@durationgroup.com", phone: "9175950226", company: "Duration Group", role: "Independent Sponsor", message: "I want to discuss what an engagement with you all looks like", hearAboutUs: "Twitter" },
    { date: "2025-12-11", firstName: "Stuart", lastName: "Hutton", email: "shutton@reppertcapital.com", phone: "7134253775", company: "Reppert Capital", role: "Family Office", message: "I'd like to learn more about your platform and pricing structure", hearAboutUs: "Google" },
    { date: "2025-12-10", firstName: "Carly", lastName: "Lenihan", email: "carlyn@evolvecapital.com", phone: "214-247-6698", company: "Evolve Capital", role: "Private Equity", message: "Deals 2-5M in EBITDA - industry agnostic", hearAboutUs: "CRM" },
    { date: "2025-12-10", firstName: "Sanjali", lastName: "A Munot", email: "sanjali.munot@ekalife.com", phone: "9321183531", company: "Ekalife", role: "Individual Investor", message: "Want to understand off market deal sourcing for specific sectors", hearAboutUs: "AI search" },
    { date: "2025-11-16", firstName: "Rob", lastName: "Polakoff", email: "rjp@barnsbrook.com", phone: "6092733740", company: "Barnsbrook", role: "Independent Sponsor", message: "How can I work with SourceCo to see off-market deals?", hearAboutUs: "Online Search" },
    { date: "2025-11-15", firstName: "Mobeen", lastName: "Rana", email: "mobeenrana@mrlegalinn.com", phone: "03227373922", company: "MR Legal Inn", role: "Advisor / Banker", message: "Deal sourcing", hearAboutUs: "Google" },
    { date: "2025-11-14", firstName: "Minh", lastName: "Le", email: "minh@tvdcp.com", phone: "9843295996", company: "TVDCP", role: "Search Fund", message: "Sourcing deals", hearAboutUs: "Search engine" },
    { date: "2025-11-11", firstName: "Ben", lastName: "Gedeon", email: "ben@packholdings.com", phone: "3308429571", company: "Pack Holdings", role: "Search Fund", message: "Buy-side options for a pair of fundless sponsors", hearAboutUs: "Other searcher" },
    { date: "2025-11-08", firstName: "Azar", lastName: "Afellah", email: "aafellah@sellsidegroup.com", phone: "2679059961", company: "Sellside Group", role: "Private Equity", message: "Buyers/Sellers matching", hearAboutUs: "Tomos" },
    { date: "2025-11-07", firstName: "Leonard", lastName: "Holter", email: "leonard@holterholdings.com", phone: "9296261703", company: "Holter Holdings", role: "Family Office", message: "Buyer-side brokers", hearAboutUs: "ChatGPT" },
    { date: "2025-11-05", firstName: "Nick", lastName: "Horacek", email: "nhoracek@windsorpath.com", phone: "7178085987", company: "Windsor Path", role: "Private Equity", message: "VP on the M&A team, looking to connect for pipeline of opportunities. Seeking accounting firms $3-35m revenue across the US.", hearAboutUs: "Brian McAuley at One Rock Capital" },
    { date: "2025-11-05", firstName: "Grant", lastName: "McClure", email: "grant@brightleafholdings.com", phone: "5125909014", company: "Brightleaf Holdings", role: "Family Office", message: "Finding deals on SourceCo (saw Tomos's post on collision repair)", hearAboutUs: "LinkedIn" },
    { date: "2025-11-04", firstName: "Heidi", lastName: "Broom", email: "hbroom@maristella.net", phone: "4078651143", company: "Maristella", role: "Search Fund", message: "Sourcing details to fit our current state of a single acquisition", hearAboutUs: "Google" },
    { date: "2025-11-03", firstName: "Brijendra", lastName: "Singh", email: "brijendrasingh@finceptpro.com", phone: "918264097191", company: "FinceptPro", role: "Advisor / Banker", message: "Investment banking firm based in India, expanding to UAE, seeking M&A deal opportunities $10M-$100M", hearAboutUs: "AI" },
    { date: "2025-11-01", firstName: "David", lastName: "Short", email: "david@shortpartners.com.au", phone: "0403041938", company: "Short Partners", role: "Family Office", message: "Seeking B2B services or niche manufacturing acquisitions in Sydney, $1M-$3M EBITDA, AI-enhanceable businesses", hearAboutUs: "Manus AI" },
  ];
  return raw.map((r, i) => makeSCLead(i, "SC Intro Call Form", r));
}

export function parseSourceCoTargetLeads(): Lead[] {
  const raw = [
    { date: "2026-03-02", firstName: "Florian", lastName: "Kapitza", email: "florian.kapitza@ensu.ch", phone: "+41774250828", company: "ENSU", role: "Advisor / Banker", message: "Mid-caps (>10m EV) in Switzerland, profitable, life sciences industry", hearAboutUs: "Websearch", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "", geography: "Switzerland" },
    { date: "2026-02-27", firstName: "David", lastName: "Frankel", email: "david@hanacovc.com", phone: "5166985434", company: "DVHNJF", role: "Independent Sponsor", message: "Robotics & industrial automation field services, $20M-$125M revenue, $5M-$20M EBITDA, founder-owned preferred", hearAboutUs: "Google", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$20M-$125M", geography: "US, ideally northeast" },
    { date: "2026-02-25", firstName: "Bexi", lastName: "Jam", email: "bexijam842@creteanu.com", phone: "", company: "Solaris Inc", role: "Private Equity", message: "NA", hearAboutUs: "NA", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2026-02-24", firstName: "Munzir", lastName: "Tandel", email: "munzir@tandelcapital.com", phone: "+91 7338292383", company: "Tandel Capital Partners", role: "Advisor / Banker", message: "Looking to get into M&A advisory for mid and lower mid market in India", hearAboutUs: "ChatGPT", acquisitionStrategy: "We're in thesis-building mode" },
    { date: "2026-02-21", firstName: "Grant", lastName: "Grava", email: "ggrava@covllc.com", phone: "6173653003", company: "Covington Associates", role: "Advisor / Banker", message: "Sell-side M&A advisory focused on healthcare services, HCIT, and related software. TEV $30-$300M", hearAboutUs: "Perplexity", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$30M-$300M", geography: "US, Canada" },
    { date: "2026-02-19", firstName: "Leo", lastName: "Qendro", email: "oqendro@gmail.com", phone: "9293536284", company: "DeCielo Property Group", role: "Other", message: "Understanding how SourceCo aggregates target lists and data included with each company", hearAboutUs: "Google", acquisitionStrategy: "We're in thesis-building mode" },
    { date: "2026-02-19", firstName: "Michael", lastName: "Tindall", email: "michael@moderndistributionnc.com", phone: "5138152522", company: "Modern Distribution", role: "Corporate", message: "Looking to acquire health clinics in OH, NC, KY, SC, VA focused on hormone wellness, weight loss", hearAboutUs: "LinkedIn", acquisitionStrategy: "We're in thesis-building mode", targetRevenue: "$1M+", geography: "Ohio, North Carolina, Kentucky, SC, VA" },
    { date: "2026-02-18", firstName: "Jackson", lastName: "Bowen", email: "jackson@thebowencompany.com", phone: "4077125033", company: "The Bowen Company", role: "Family Office", message: "Small company, +250k EBITDA, no more than 3x EBITDA, under $2M total purchase price", hearAboutUs: "Friend", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "<$2M" },
    { date: "2026-02-17", firstName: "Theodore", lastName: "Sutherland", email: "theodore@sageblacksmith.com", phone: "8572988252", company: "Sage Blacksmith", role: "Search Fund", message: "Mid career prof backed by Pacific Lake ($2B AUM), looking into industrial tech companies serving manufacturers, $5-20M rev", hearAboutUs: "GPT", acquisitionStrategy: "We're mid-process on 1-2 deals", targetRevenue: "$5M-$20M", geography: "US" },
    { date: "2026-02-17", firstName: "Saul", lastName: "Doglio", email: "saul@voltforcerenewables.com.au", phone: "0455222382", company: "VoltForce Group", role: "Private Equity", message: "-", hearAboutUs: "Google", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2026-02-16", firstName: "Aziz", lastName: "Kali", email: "aziz.kali@presight.ai", phone: "+77057774006", company: "Presight AI", role: "Corporate", message: "EV ≤$500M, EBITDA 20%+, B2B/B2G, GovTech, Smart Cities, FinTech/RegTech", hearAboutUs: "Google", acquisitionStrategy: "We're actively sourcing targets", geography: "Middle East, Europe, SE Asia, North America" },
    { date: "2026-02-11", firstName: "Ben", lastName: "Griffith", email: "Ben.griffith@GMAXind.com", phone: "16313484050", company: "GMAX Industries", role: "Corporate", message: "Disposable medical products or complementary industry (kit packer), $1M-$10M", hearAboutUs: "Google", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$1M-$10M" },
    { date: "2026-02-11", firstName: "Leo", lastName: "Qendro", email: "oqendro@gmail.com", phone: "9293536284", company: "DeCielo Property Group", role: "Corporate", message: "HVAC service providers in the midwest, $1-50M revenue, mostly commercial with recurring revenue", hearAboutUs: "LinkedIn", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$1M-$50M", geography: "Midwest US" },
    { date: "2026-02-08", firstName: "Michael", lastName: "Brady", email: "mbrady@40millionowners.com", phone: "9176796054", company: "40 Million Owners", role: "Advisor / Banker", message: "Advisory firm focused on ESOPs. Clients are long-term acquirers across industries and sizes", hearAboutUs: "Google", acquisitionStrategy: "We're mid-process on 1-2 deals" },
    { date: "2026-02-08", firstName: "Andrew", lastName: "Tsinikas", email: "andrew@neurabright.co", phone: "+16787725383", company: "Neurabright", role: "Search Fund", message: "Third party property management companies, not captive, no short term rental, northeast US, $5-15M revenue", hearAboutUs: "Google", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$5M-$15M", geography: "Northeast US" },
    { date: "2026-02-06", firstName: "Sydney", lastName: "Marmel", email: "sydney@teambigtable.com", phone: "516-659-6638", company: "BigTable", role: "Individual Investor", message: "1-2M EBITDA, Industrial Manufacturing & Distribution, NY/CT/NJ commutable", hearAboutUs: "ChatGPT", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$1M-$2M EBITDA", geography: "NY, CT, NJ" },
    { date: "2026-02-05", firstName: "Mike", lastName: "Brady", email: "mbrady@40millionowners.com", phone: "9176796054", company: "40 Million Owners", role: "Advisor / Banker", message: "Advisory firm helping ESOPs leverage tax-advantage buyer profile for acquisitions", hearAboutUs: "Google", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2026-02-03", firstName: "Farhan", lastName: "Javed", email: "farhan@franchable.com", phone: "9183446468", company: "Franchable", role: "Other", message: "Looking for multi-unit franchisees of brands with 50-500 units", hearAboutUs: "Google search", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2026-02-03", firstName: "Maximiliano", lastName: "Lieban", email: "maximiliano.lieban@thesiscapital.com", phone: "718-473-0243", company: "Thesis Capital Partners", role: "Independent Sponsor", message: "Independent sponsor in Houston, 13 people, 4-8M EBITDA range, operating partners with 15-20 years experience", hearAboutUs: "Google search", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$4M-$15M EBITDA", geography: "US nationwide" },
    { date: "2026-02-03", firstName: "Samuel", lastName: "Zimmer", email: "samz@beachtreecapital.us", phone: "19089639445", company: "Beach Tree Capital", role: "Advisor / Banker", message: "Omit SaaS firms; $1-10M EBIT; US headquartered", hearAboutUs: "Grok", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$1M-$10M EBIT", geography: "US" },
    { date: "2026-02-01", firstName: "Shawn", lastName: "Wesley", email: "shawn@tallytaxman.com", phone: "8506613519", company: "Northside Tax Service", role: "Individual Investor", message: "Looking to acquire a few SMBs", hearAboutUs: "Web search", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2026-01-28", firstName: "Lei", lastName: "Jin", email: "lei.jin@summit-bridgecapital.com", phone: "12816286819", company: "Summit-Bridge Capital", role: "Independent Sponsor", message: "Representing strategic buyers to acquire mid-cap firms", hearAboutUs: "Perplexity", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2026-01-27", firstName: "Myall", lastName: "Budden", email: "myall@incrementums.org", phone: "6155431633", company: "Incrementums", role: "Corporate", message: "Active leads", hearAboutUs: "Other", acquisitionStrategy: "We're in thesis-building mode" },
    { date: "2026-01-26", firstName: "Rish", lastName: "Sharma", email: "rsharma@nextgengp.com", phone: "17143902213", company: "NextGen GP", role: "Private Equity", message: "Sourcing founder-owned US commercial security integrators and alarm companies, $5-25M revenue, $1.5-7M EBITDA", hearAboutUs: "Email", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$5M-$25M", geography: "US" },
    { date: "2026-01-26", firstName: "Nat", lastName: "Liang", email: "liangjiaqi@inone.ltd", phone: "+65648280215", company: "InOne", role: "Individual Investor", message: "Looking for education institution and training centers", hearAboutUs: "Google", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2026-01-22", firstName: "Greg", lastName: "Caso", email: "greg.caso@castorkey.com", phone: "4103826926", company: "Castor Key Partners", role: "Other", message: "Long-term holding company focused on infrastructure and industrial services, $1-5M EBITDA", hearAboutUs: "LinkedIn", acquisitionStrategy: "We're mid-process on 1-2 deals", targetRevenue: "$1M-$5M EBITDA" },
    { date: "2026-01-21", firstName: "Ben", lastName: "Martin", email: "ben@vistaadvisorypartners.com", phone: "3109053665", company: "Vista Advisory Partners", role: "Advisor / Banker", message: "Aviation technology vertical-market B2B SaaS. Safety, compliance, training, flight ops, maintenance, airport ops", hearAboutUs: "Google", acquisitionStrategy: "We're actively sourcing targets", geography: "US, Canada, UK, Nordics" },
    { date: "2026-01-21", firstName: "Massimo", lastName: "Amoroso", email: "m.amoroso@dealnext.eu", phone: "+39 3474769595", company: "Dealnext", role: "Advisor / Banker", message: "Client interested in small add-ons in N America for diaper components, films for hygiene applications", hearAboutUs: "ChatGPT", acquisitionStrategy: "We're actively sourcing targets", geography: "North America, Central Mexico" },
    { date: "2026-01-19", firstName: "Laurynas", lastName: "Navakauskas", email: "laurynas.navakauskas@teltonika.lt", phone: "+37069327629", company: "Teltonika IoT", role: "Corporate", message: "Global IoT hardware manufacturer, Telematics/Networks/Energy/Telemedicine/Security, interested in add-on acquisitions", hearAboutUs: "ChatGPT", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2026-01-17", firstName: "Kirk", lastName: "Sabiston", email: "ksabiston@valcourt.net", phone: "13473713865", company: "Valcourt Group", role: "Corporate", message: "PE-backed strategic buyer (20+ acquisitions since 2021), roofing, waterproofing, facade restoration, window cleaning", hearAboutUs: "Word of mouth", acquisitionStrategy: "We're actively sourcing targets", geography: "Entire US" },
    { date: "2026-01-16", firstName: "Cinzel", lastName: "Washington", email: "info@eluxcre.com", phone: "21254990144", company: "Cinzel", role: "Other", message: "Not sure", hearAboutUs: "Internet", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2026-01-14", firstName: "Dave", lastName: "Kudla", email: "dawidkudla@new2ndcapital.com", phone: "5619277527", company: "Valor Strategic Partners", role: "Private Equity", message: "Lower middle market independent sponsor, transportation and logistics, 2-5M EBITDA", hearAboutUs: "Google search", acquisitionStrategy: "We're mid-process on 1-2 deals", targetRevenue: "$2M-$5M EBITDA" },
    { date: "2026-01-14", firstName: "Hleb", lastName: "Dapkiunas", email: "h.dapkiunas@andersenlab.com", phone: "+48571500965", company: "Andersen Lab", role: "Other", message: "Interested in acquiring a company, looking for matching targets", hearAboutUs: "LinkedIn", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2026-01-12", firstName: "Austin", lastName: "Uline", email: "austin.uline@borgmancapital.com", phone: "9522503341", company: "Borgman Capital", role: "Private Equity", message: "Revenue $10M-$100M, EBITDA $2M-$15M, Midwest-focused, prefer manufacturing/distribution/food & beverage", hearAboutUs: "Google search", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$10M-$100M", geography: "Midwest US" },
    { date: "2026-01-12", firstName: "Lisa", lastName: "Tuttle", email: "collinsgirl304@gmail.com", phone: "13044217387", company: "", role: "Individual Investor", message: "Deal sourcing", hearAboutUs: "Google", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2026-01-07", firstName: "Nilay", lastName: "Kulkarni", email: "nilay@jupiterservicesgroup.com", phone: "3097500837", company: "Jupiter Services Group", role: "Private Equity", message: "IT/tech services, $5-30M revenue, founder-led, digital engineering/data/AI/managed services", hearAboutUs: "Google Search", acquisitionStrategy: "We're in thesis-building mode", targetRevenue: "$5M-$30M" },
    { date: "2026-01-05", firstName: "Sumit", lastName: "Aneja", email: "sumit@gcpartners.tech", phone: "5142903283", company: "GC Partners", role: "Corporate", message: "$2-20M ARR, cash flow breakeven+ in governance, risk, compliance and security", hearAboutUs: "ChatGPT", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$2M-$20M ARR" },
    { date: "2025-12-31", firstName: "Brock", lastName: "Lepin", email: "acquisitions@valoremcapital.com", phone: "402-740-3960", company: "Valorem Capital", role: "Private Equity", message: "Acquire companies with $2M+ EBITDA in Roads, Concrete, Bridges, Steel Fabrication, Fiber and Cable Install", hearAboutUs: "Google", acquisitionStrategy: "We're under LOI", targetRevenue: "$2M+ EBITDA", geography: "Top 20+ US markets" },
    { date: "2025-12-27", firstName: "Adam", lastName: "Berman", email: "adam@savadeholdings.com", phone: "6177990584", company: "Savade Holdings", role: "Independent Sponsor", message: "3-10M EBITDA businesses in health and human services, K-12 and workforce training", hearAboutUs: "GPT/Copilot", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$3M-$10M EBITDA" },
    { date: "2025-12-09", firstName: "Aakash", lastName: "Patel", email: "aakashhasquestions@gmail.com", phone: "4078488718", company: "", role: "Independent Sponsor", message: "Self funded searcher looking to acquire a business in Orlando metro area, $500k-$1.5M SDE", hearAboutUs: "Grok", acquisitionStrategy: "We're in thesis-building mode", geography: "Orlando, FL" },
    { date: "2025-12-02", firstName: "Gabriel", lastName: "Fogel", email: "gabriel@brickellbayholdings.com", phone: "3104333872", company: "Brickell Bay Holdings", role: "Private Equity", message: "Acquiring founder-led vertical SaaS companies with recurring revenue, low churn, deeply embedded workflows", hearAboutUs: "Online", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2025-11-28", firstName: "Hossein", lastName: "Afshar", email: "hossein.afshar@ksginvestmentgroup.com", phone: "+16404096109", company: "KSG Investment Group", role: "Advisor / Banker", message: "Want to find list of sellers looking to sell their businesses", hearAboutUs: "Google", acquisitionStrategy: "We're mid-process on 1-2 deals" },
    { date: "2025-11-21", firstName: "Adam", lastName: "Berman", email: "adam@positivesumholdings.com", phone: "6177990584", company: "Positive Sum Holdings", role: "Independent Sponsor", message: "Two experienced professionals seeking 3-12M EBITDA in health/human services and education verticals", hearAboutUs: "Google", acquisitionStrategy: "We're in thesis-building mode", targetRevenue: "$3M-$12M EBITDA" },
    { date: "2025-11-20", firstName: "Dan", lastName: "Selis", email: "dan@selisadvisors.com", phone: "16188187147", company: "Selis Advisors", role: "Private Equity", message: "$500M fund, food/beverage/agribusiness, revenue $20-200M, EBITDA $4-20M, US/Canada/UK/W.Europe", hearAboutUs: "Google", acquisitionStrategy: "We're mid-process on 1-2 deals", targetRevenue: "$20M-$200M", geography: "US, Canada, UK, W.Europe" },
    { date: "2025-11-20", firstName: "Friso", lastName: "Spoor", email: "friso@superautomatic.ai", phone: "+31617528670", company: "Superautomatic", role: "Private Equity", message: "Setting up deal origination for PE firm, 2-20M EBITDA, Consumer/Tech/Services/Health/Manufacturing, Benelux and Denmark", hearAboutUs: "ChatGPT", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$2M-$20M EBITDA", geography: "Benelux, Denmark" },
    { date: "2025-11-18", firstName: "Benjamin", lastName: "Odofin", email: "bodofin@umd.edu", phone: "12404628822", company: "", role: "Other", message: "Risk Management SaaS firms", hearAboutUs: "ChatGPT", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2025-11-18", firstName: "Nolan", lastName: "Schepman", email: "nolan@emsoft.com", phone: "4244433409", company: "Emergence Software", role: "Private Equity", message: "B2B Software $2-25M revenue, $1.5M+ EBITDA, 90%+ GRR, 25%+ growth, DevOps/HCIT/AutoTech/Supply Chain", hearAboutUs: "Google", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$2M-$25M" },
    { date: "2025-11-13", firstName: "Josh", lastName: "Weatherly", email: "josh.weatherly@onebrief.com", phone: "8089807163", company: "Onebrief", role: "Corporate", message: "AI-powered planning platform for DoD, looking for strategic tuck-ins and acquihires", hearAboutUs: "Referral", acquisitionStrategy: "We're actively sourcing targets" },
    { date: "2025-11-07", firstName: "Richard", lastName: "Okon", email: "rokon@acquireedgepartnersllc.com", phone: "17707018244", company: "AcquireEdge Partners", role: "Private Equity", message: "Mid market opportunities in Georgia and Southeast US", hearAboutUs: "Google", acquisitionStrategy: "We're actively sourcing targets", geography: "Georgia, Southeast US" },
    { date: "2025-11-05", firstName: "Dennis", lastName: "Chernov", email: "dchernov@veritacorp.com", phone: "13146075299", company: "Verita", role: "Corporate", message: "Infrastructure construction, energy T&D, commercial/industrial, data centers, telecom. Revenue $30M-$300M", hearAboutUs: "Google", acquisitionStrategy: "We're mid-process on 1-2 deals", targetRevenue: "$30M-$300M", geography: "VA, SC, GA, FL, TX, OK, AZ, UT, NV, OR" },
    { date: "2025-11-04", firstName: "Senthil", lastName: "Veeraragavan", email: "senthil.veeraragavan@icloud.com", phone: "12486705075", company: "Cue360", role: "Individual Investor", message: "Looking for 1M+ EBITDA/SDE, 3-4x SDE, SBA pre-qualified. Industrial, manufacturing, construction services", hearAboutUs: "Google search", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$1M+ EBITDA" },
    { date: "2025-11-03", firstName: "Leroy", lastName: "Joenoes", email: "ljoenoes@micron.com", phone: "12063371993", company: "Joenoes Corporation", role: "Individual Investor", message: "200k-1M range, open to any fields, looking for seller financing", hearAboutUs: "Google", acquisitionStrategy: "We're actively sourcing targets", targetRevenue: "$200K-$1M" },
    { date: "2025-11-01", firstName: "Sampad", lastName: "Prudentia", email: "sampadprudentiapartners@gmail.com", phone: "", company: "Sampad", role: "Advisor / Banker", message: "Ok", hearAboutUs: "NA", acquisitionStrategy: "We're in thesis-building mode" },
  ];
  return raw.map((r, i) => makeSCLead(i, "SC Free Targets Form", {
    ...r,
    currentSourcing: r.acquisitionStrategy || "",
  }));
}
