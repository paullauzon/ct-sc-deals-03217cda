import { Lead, LeadSource } from "@/types/lead";

// Parse contact form CSV leads (since Nov 1, 2025)
function parseContactLeads(): Lead[] {
  const raw: Array<{
    date: string; name: string; phone: string; email: string;
    role: string; url: string; deals: string; message: string;
  }> = [
    { date: "2026-03-01", name: "Alexander Kurian", phone: "7186149846", email: "alexander@operatewise.com", role: "Independent Sponsor", url: "https://operatewise.capital", deals: "0-2", message: "I have used this platform in the past. Please give me a call on Monday." },
    { date: "2026-02-28", name: "Harshal S Devnani", phone: "7727662987", email: "harshal.devnani7@gmail.com", role: "Business Owner", url: "google.com", deals: "0-2", message: "Looking for generalist acquisitions for myself." },
    { date: "2026-02-27", name: "David Frankel", phone: "5166985434", email: "dfrankel11@gmail.com", role: "Independent Sponsor", url: "https://www.linkedin.com/in/david-frankel/", deals: "0-2", message: "We are focused on technician-heavy, recurring service businesses that support manufacturing, logistics, and industrial infrastructure environments in the US" },
    { date: "2026-02-25", name: "Tim Murray", phone: "9144978564", email: "tim.murray@conniehealth.com", role: "Corporate", url: "https://www.conniehealth.com/", deals: "3-10", message: "Looking for a partner to provide outbound origination services that can surface off-market M&A opportunities and early seller intent at scale." },
    { date: "2026-02-24", name: "Philip Lang", phone: "6092144125", email: "philip@queenscourtcap.com", role: "Independent Sponsor", url: "http://www.queenscourtcap.com", deals: "0-2", message: "Hi! I've heard great things and interested in finding out more about what you do." },
    { date: "2026-02-24", name: "Amy Hu", phone: "4043542253", email: "amy.hu@pactcp.com", role: "Private Equity", url: "https://pactcapitalpartners.com/", deals: "0-2", message: "Looking for best-in-class sourcing approaches" },
    { date: "2026-02-23", name: "Javier Lombardi", phone: "(650)9185426", email: "javier.lombardi@latyka.com", role: "Private Equity", url: "https://www.latyka.com/", deals: "3-10", message: "I'm Head of Investments at Latyka Group, a multi-industry investment platform with active operations in logistics, security, and business services." },
    { date: "2026-02-23", name: "Grady Kidder", phone: "4104930675", email: "grady@potamusequity.com", role: "Private Equity", url: "https://www.potamusequity.com/", deals: "3-10", message: "We're working with two executives from the IT services industry to build an acquisition platform and are currently contemplating engaging a buyside advisor." },
    { date: "2026-02-20", name: "Ashley Wilson", phone: "7252251465", email: "ashley@smartassistanthub.com", role: "Corporate", url: "https://smartassistanthub.com/", deals: "25-50", message: "We provide expert Virtual Assistant Services. I'd love to show you how it works." },
    { date: "2026-02-19", name: "Michael Madden", phone: "2017246492", email: "michael.madden@stapleinvestments.com", role: "Private Equity", url: "https://stapleinvestments.com/", deals: "3-10", message: "We are looking to improve and expand our deal sourcing function." },
    { date: "2026-02-19", name: "Mark Tashkovich", phone: "9174393849", email: "mark.tashkovich@altacp.com", role: "Advisor / Banker", url: "https://www.altacapitalpartners.com", deals: "3-10", message: "I would welcome an intro call to learn more about your business model and how you work." },
    { date: "2026-02-18", name: "Jay Lax", phone: "9178642523", email: "jlax@avalonabagroup.com", role: "Corporate", url: "https://helianthuspbs.com/", deals: "0-2", message: "We operate in the ABA Therapy market and are looking for more clinics to roll up." },
    { date: "2026-02-18", name: "Dan Citrenbaum", phone: "6102561328", email: "DCitrenbaum@gmail.com", role: "Family Office", url: "https://theentrepreneuroption.com/", deals: "0-2", message: "Looking to purchase a business. Have not worked with a service like yours before." },
    { date: "2026-02-18", name: "Chris Cathcart", phone: "2024258257", email: "ccathcart@thehalifaxgroup.com", role: "Private Equity", url: "https://www.thehalifaxgroup.com", deals: "10-25", message: "Like to have an intro call" },
    { date: "2026-02-16", name: "Dan Citrenbaum", phone: "6102561328", email: "DCitrenbaum@gmail.com", role: "Business Owner", url: "https://theentrepreneuroption.com/", deals: "0-2", message: "I'd like to learn about your search process" },
    { date: "2026-02-15", name: "Samir Taghiyev", phone: "6474500221", email: "samir@taghiyev.ca", role: "Family Office", url: "https://www.taghiyev.ca", deals: "0-2", message: "Looking to do a roll up of industrial businesses in Canada, especially Alberta." },
    { date: "2026-02-12", name: "Chris Cathcart", phone: "2024258257", email: "ccathcart@thehalifaxgroup.com", role: "Private Equity", url: "https://www.thehalifaxgroup.com", deals: "10-25", message: "Love to hear more about the offering" },
    { date: "2026-02-09", name: "Mibaraka Jordan", phone: "6232864451", email: "mibarakajordan@fishcurrentcapital.com", role: "Private Equity", url: "https://www.fishcurrentcapital.com/", deals: "3-10", message: "We're looking to optimize our acquisition process through proactive thematic sourcing." },
    { date: "2026-02-09", name: "Timur Grinevic", phone: "5149278844", email: "Timur.Grinevic@bearstoke.com", role: "Private Equity", url: "https://www.bearstoke.com", deals: "3-10", message: "Looking for a better way to close transactions" },
    { date: "2026-02-07", name: "Jeff Cree", phone: "2146933505", email: "jcree@tradegauge.ai", role: "Private Equity", url: "https://www.tradegauge.ai/", deals: "10-25", message: "Looking to speak someone in partnerships" },
    { date: "2026-02-03", name: "Kieran Knightly", phone: "9739759860", email: "kknightly@claritygrowthcap.com", role: "Independent Sponsor", url: "https://www.claritygrowthcap.com/", deals: "0-2", message: "Looking to make an acquisition in the accounting services space with revenue between $5mm to $50mm" },
    { date: "2026-02-02", name: "Matthew Orley", phone: "9175408710", email: "matthew@redcottageinc.com", role: "Business Owner", url: "https://www.redcottage.com", deals: "3-10", message: "Worked with CapTarget a few years back. Would like to revisit our conversations around our new M&A strategy." },
    { date: "2026-02-02", name: "Jack Reinhart", phone: "2489303212", email: "jrrein98@gmail.com", role: "Private Equity", url: "", deals: "0-2", message: "I am looking to acquire a business in the Pet Services space through an independent sponsor model." },
    { date: "2026-01-27", name: "Konstantin Zedelius", phone: "015140705563", email: "konstantin.zedelius@rotas.de", role: "Business Owner", url: "https://www.rotas.de/", deals: "3-10", message: "We're a buy & build platform focused on pump services in Germany. Are you exclusively active in the US or also in Europe?" },
    { date: "2026-01-27", name: "Jim Stoffel", phone: "6123867993", email: "JSTOFFEL@RAHR.COM", role: "Corporate", url: "https://rahr.com", deals: "0-2", message: "We are looking for outreach in M&A space in the food and beverage ingredients space." },
    { date: "2026-01-27", name: "Eric Lin", phone: "9179755306", email: "eric.lin@conniehealth.com", role: "Corporate", url: "https://www.conniehealth.com/", deals: "3-10", message: "We are looking to accelerate our roll up strategy. I am leading our M&A efforts and would like to learn about Captarget's managed services." },
    { date: "2026-01-26", name: "Charles ALLAND", phone: "+33619170510", email: "ch.alland@allandetrobert.fr", role: "Business Owner", url: "https://www.allandetrobert.com/", deals: "0-2", message: "My company is France based. We are looking to potentially expand and diversify in the US." },
    { date: "2026-01-25", name: "Pasha Baradaran", phone: "(236) 594-7995", email: "pasha@aera.inc", role: "Advisor / Banker", url: "https://www.aera.inc/", deals: "3-10", message: "We're looking to scale our dealflow across different channels. Curious about your services." },
    { date: "2026-01-21", name: "Jay Farin", phone: "4255153577", email: "rtkjeii@gmail.com", role: "Business Owner", url: "https://www.realtakai.com", deals: "3-10", message: "I'm the founder & CEO of a profitable DTC apparel brand with ~$3–4M in trailing revenue. Evaluating a growth recap." },
    { date: "2026-01-21", name: "Bilal Muhammad", phone: "4434066553", email: "amnabillall@gmail.com", role: "Family Office", url: "", deals: "10-25", message: "Looking to explore" },
    { date: "2026-01-20", name: "Tom Merriam", phone: "9733370963", email: "tom@merriampartners.com", role: "Family Office", url: "https://merriampartners.com", deals: "0-2", message: "Started search in earnest 1 month ago. Looking for ways to increase chances of finding quality deals in NJ, Eastern PA, or Southern NY." },
    { date: "2026-01-19", name: "Ben Williams", phone: "8176916298", email: "williams@treatyoakequity.com", role: "Private Equity", url: "https://www.treatyoakequity.com/", deals: "0-2", message: "We're an independent sponsor team based in Austin TX with 4 active platform investments. Looking to be more proactive about direct sourcing." },
    { date: "2026-01-16", name: "Telless Cade", phone: "2142842846", email: "telless@icloud.com", role: "Advisor / Banker", url: "https://viacadeco.com", deals: "3-10", message: "Need deal sourcing for my clients" },
    { date: "2026-01-15", name: "Joseph A. Cosio-Barron", phone: "4159908141", email: "jcosiobarron@gmail.com", role: "Other", url: "https://srs.finance", deals: "3-10", message: "Help grow my business." },
    { date: "2026-01-15", name: "PAWEL", phone: "6476062594", email: "pawel@cargocounty.com", role: "Business Owner", url: "http://www.cargocounty.com", deals: "0-2", message: "I own a logistics, supply chain company doing about $80M in sales. Looking to see what other industries we can leverage." },
    { date: "2026-01-14", name: "Brandon Anderson", phone: "2147290599", email: "banderson@primetimeres.com", role: "Corporate", url: "https://houston-building-maintenance.com/", deals: "3-10", message: "Primetime looking to grow through acquisition by acquiring commercial mechanical contractors focused on service." },
    { date: "2026-01-13", name: "Valeria Rivera", phone: "", email: "valeriarivera31@gmail.com", role: "Private Equity", url: "https://www.captarget.com/", deals: "0-2", message: "sss" },
    { date: "2026-01-11", name: "Dr. Phillip Hearn", phone: "3147502004", email: "phearn@helixmanagementgroup.com", role: "Private Equity", url: "https://helixmanagementgroup.com/", deals: "3-10", message: "We are actively building a repeatable acquisition pipeline for Helix Management Group focused on industrial services and construction related businesses." },
    { date: "2026-01-09", name: "Vidushi Gupta", phone: "9522196602", email: "vidushi.gupta@innovaccer.com", role: "Corporate", url: "https://innovaccer.com/", deals: "0-2", message: "We are looking for 3rd party channel partners who can help identify potential targets and build pipeline for M&A." },
    { date: "2026-01-09", name: "Ghaneshwaran Muthusamy", phone: "9365779828", email: "ghanesh@trueupventures.com", role: "Other", url: "http://www.trueupventures.com", deals: "0-2", message: "Looking for assistance in sourcing warm leads for bookkeeping/outsourced CFO practices. Revenue >2mm/750k EBITDA in Greater Houston." },
    { date: "2026-01-09", name: "David Bartelme", phone: "281-904-8321", email: "david.bartelme@endura-llc.com", role: "Private Equity", url: "https://endura-llc.com/", deals: "0-2", message: "Looking for add-on acquisition targets that do PCBA, wire cable harness, or control box builds." },
    { date: "2026-01-07", name: "Jacob Blas", phone: "7603302442", email: "jacob@system4socalcleaning.com", role: "Other", url: "http://system4socalcleaning.com", deals: "0-2", message: "I am local and provide service in San Diego. Hoping to offer a complimentary cleaning bid." },
    { date: "2026-01-07", name: "Amy Steacy", phone: "703-247-9313", email: "asteacy@bbbnp.org", role: "Corporate", url: "https://bbbprograms.org", deals: "0-2", message: "We are a nonprofit organization, interested in acquisition opportunities." },
    { date: "2026-01-06", name: "Jared L Curtis", phone: "9788313019", email: "jared@curtisacquisitionpartners.com", role: "Independent Sponsor", url: "https://www.linkedin.com/company/curtis-acquisition-partners", deals: "0-2", message: "I am a family-office backed sponsor-operator looking to acquire my next platform business in the building industry." },
    { date: "2026-01-05", name: "Sean Patel", phone: "718-288-6842", email: "sean@teambigtable.com", role: "Search Fund", url: "https://www.lbb-industries.com/", deals: "0-2", message: "Looking to better understand lead generation / available outbound sales motion options for small business acquisition." },
    { date: "2026-01-03", name: "Mark Paliotti", phone: "5149270165", email: "mark.paliotti@outlook.com", role: "Business Owner", url: "https://www.linkedin.com/in/mark-paliotti-a5407017/", deals: "0-2", message: "Exploring acquisition of a manufacturing company in Montreal area. Revenue 5-30M." },
    { date: "2026-01-01", name: "Jama", phone: "6479756713", email: "jama@subcamel.com", role: "Business Owner", url: "", deals: "3-10", message: "I like to know more about what you do and potentially partner with you guys." },
    { date: "2025-12-30", name: "Aiman Aftab", phone: "9192288563", email: "aiman@vantorq.com", role: "Private Equity", url: "https://ainvestmentsm.com/", deals: "0-2", message: "We are looking to acquire businesses in the home health care space, particularly skilled home health care services." },
    { date: "2025-12-29", name: "Alina Joseph", phone: "8182179345", email: "alina7788@hotmail.com", role: "Business Owner", url: "http://www.Saffory.com", deals: "3-10", message: "Want to learn more." },
    { date: "2025-12-24", name: "Abigail Gupta", phone: "6508877769", email: "abigail@vettedvas.com", role: "Other", url: "https://vas4hire.com", deals: "0-2", message: "We provide expert Virtual Assistant Services including lead generation, cold calling, appointment setting." },
    { date: "2025-12-23", name: "Avery Humphries", phone: "2047972988", email: "ahumphries@imperialcap.com", role: "Private Equity", url: "https://www.imperialcap.com/", deals: "10-25", message: "Imperial is a Toronto-based middle-market PE firm managing over $3.5B AUM. Looking to build relationships with buyside brokers." },
    { date: "2025-12-23", name: "Meelan Patel", phone: "8453257722", email: "mp@theatrecap.com", role: "Private Equity", url: "http://www.theatrecap.com", deals: "0-2", message: "Lead gen" },
    { date: "2025-12-22", name: "Mrunmayee Padhye", phone: "9195646948", email: "mrun@mergerscorp.com", role: "Advisor / Banker", url: "https://mergerscorp.com", deals: "0-2", message: "Reaching out to know how to list sell side mandates on the portal." },
    { date: "2025-12-21", name: "David Dawson", phone: "3135027144", email: "david.bloodhoundsmedia@gmail.com", role: "Business Owner", url: "https://www.bloodhoundsmedia.com", deals: "3-10", message: "Robust web-based admin panel for streaming and e-commerce platform." },
    { date: "2025-12-19", name: "Jack Harvey", phone: "9175950226", email: "jack@durationgroup.com", role: "Independent Sponsor", url: "https://www.durationgroup.com/", deals: "3-10", message: "I'd love to explore what an engagement with captarget looks like." },
    { date: "2025-12-18", name: "Edvin Bailey", phone: "9056917552", email: "edbailey001@gmail.com", role: "Business Owner", url: "", deals: "0-2", message: "I have developed a control method that reduces energy consumption. Seeking a buyer for acquisition of said technology." },
    { date: "2025-12-16", name: "Prateek Aneja", phone: "9172001191", email: "paneja@infinitivecapital.com", role: "Private Equity", url: "https://www.infinitivecapital.com", deals: "0-2", message: "Catch up call" },
    { date: "2025-12-14", name: "Sameh Elrefaei", phone: "(408)417-0364", email: "selrefaei@homerfireprotection.com", role: "Independent Sponsor", url: "https://homerfireprotection.com/", deals: "0-2", message: "We're in the market for a $1-3M EBITDA fire protection services firm in DC/Maryland/Northern Virginia area." },
    { date: "2025-12-12", name: "Devin McLaughlin", phone: "6109370623", email: "devin.mclaughlin@threadlinepartners.com", role: "Private Equity", url: "https://www.threadlinepartners.com/", deals: "0-2", message: "Interested in learning more about your services and pricing models" },
    { date: "2025-12-11", name: "Alex Cram", phone: "8034098803", email: "acram@telarus.com", role: "Corporate", url: "https://www.telarus.com/services/telarus-capital/", deals: "50+", message: "Exploring options to get more at-bats. Done ~80 deals in 2 years, avg $100k EBITDA buy." },
    { date: "2025-12-10", name: "Jakub", phone: "3025654921", email: "jakub@jblngroup.com", role: "Corporate", url: "https://globaldigital.group/", deals: "3-10", message: "Scale our origination beyond internal sources." },
    { date: "2025-12-10", name: "Raheim Binnie", phone: "3137184959", email: "raheimbinnie@gmail.com", role: "Business Owner", url: "https://www.builtrightdigital.com", deals: "10-25", message: "Looking to acquire a platform business. B2B Services, $2M–$10M EBITDA. Ready to move quickly." },
    { date: "2025-12-09", name: "Tao Zhang", phone: "9142826869", email: "frank.zhang@rdiusa.com", role: "Business Owner", url: "https://www.rdichina.com/", deals: "0-2", message: "Founder of security-hardware OEM/ODM. Seeking strategic acquisition of a US installer with revenues > $3M." },
    { date: "2025-12-08", name: "Sahra", phone: "9199199199", email: "gemstrategies4@gmail.com", role: "Search Fund", url: "https://www.sahraholdings.com", deals: "3-10", message: "Sourcing off-market qualified opportunities" },
    { date: "2025-12-05", name: "Daniel Stanford", phone: "8149805065", email: "daniel.stanford@webdesignsalgorithm.com", role: "Other", url: "", deals: "3-10", message: "Web design solicitation - not a qualified lead." },
    { date: "2025-12-04", name: "Justin Fox", phone: "571-271-7996", email: "justin@special.co", role: "Private Equity", url: "https://special.co/", deals: "3-10", message: "Founded Special for acquisitive strategy in lower US healthcare. Targeting $2-$7M EBITDA, plan to deploy $50-$75M equity." },
    { date: "2025-12-03", name: "Cenk Sezgin", phone: "6465555555", email: "cenk@hypersight.co", role: "Advisor / Banker", url: "https://hypersight.co/", deals: "0-2", message: "Which segments of the market do you work on?" },
    { date: "2025-12-02", name: "Scott Mishara", phone: "9144004299", email: "scott@stonelaneholdings.com", role: "Search Fund", url: "https://www.linkedin.com/in/scott-mishara/", deals: "0-2", message: "Searching for about a year with a narrow buy box in NY-metro area, $1–2M enterprise value." },
    { date: "2025-12-02", name: "Kareem H Mahmoud", phone: "6786430414", email: "kareem@monteragroup.com", role: "Private Equity", url: "https://www.monteragroup.com/", deals: "3-10", message: "Looking for origination support to connect with leading franchisees. Origination is our biggest pain point." },
    { date: "2025-12-01", name: "Jordi Quevedo-Valls", phone: "6414511655", email: "jordi@valarbrokers.com", role: "Advisor / Banker", url: "https://valarbrokers.com/", deals: "25-50", message: "Buy-side broker representing PE firms looking for good off-market deals." },
    { date: "2025-12-01", name: "Piyush Gupta", phone: "8477025717", email: "piyush.g@2906management.com", role: "Business Owner", url: "https://allaccess.health/", deals: "0-2", message: "Looking for aging in place companies in Home Health, Home Accessibility, Medical Transportation." },
    { date: "2025-11-28", name: "Thomas Mthoba", phone: "0840174376", email: "thomas@junotraxafrica.co.za", role: "Private Equity", url: "https://junotraxafrica.co.za/", deals: "0-2", message: "Diversified business in Johannesburg. Offering 40% shareholding to investor. Mining, agriculture, construction." },
    { date: "2025-11-26", name: "David Working", phone: "2062247850", email: "dworking@zacharyscott.com", role: "Independent Sponsor", url: "http://www.zacharyscott.com", deals: "0-2", message: "Boutique investment banking firm in Pacific Northwest. Interested in expanding deal flow for independent sponsor opportunities." },
    { date: "2025-11-26", name: "Brady Blackett", phone: "3124484813", email: "bblackett@atriumhomeservices.com", role: "Corporate", url: "https://atriumhomeservices.com/", deals: "3-10", message: "I run corp dev for a home services business. Looking to acquire $16-$20M in revenue each year over the next three years." },
    { date: "2025-11-25", name: "August Meinerz", phone: "4148072913", email: "ameinerz@maxusoperations.com", role: "Corporate", url: "https://www.maxusoperations.com", deals: "0-2", message: "We are looking to learn more about your services." },
    { date: "2025-11-24", name: "Jonathan Holloway", phone: "9804192399", email: "jholloway@amplexna.com", role: "Family Office", url: "https://amplexab.se/", deals: "3-10", message: "Swedish industrial group acquiring niche manufacturing businesses. Looking to build a stronger M&A pipeline in North America." },
    { date: "2025-11-23", name: "Alan Peterson", phone: "9177323044", email: "APeterson@firstib.com", role: "Other", url: "https://www.firstib.com", deals: "25-50", message: "National top producing SBA Lender. Looking to be a resource when SBA financing makes sense." },
    { date: "2025-11-20", name: "Blake Jackman", phone: "4034709478", email: "blake@graftonstreet.ca", role: "Private Equity", url: "https://albertacorporations.com/grafton-street-concepts-inc", deals: "3-10", message: "VP Acquisitions for Grafton Street Capital. PE fund looking to acquire majority positions in small private businesses C$3-$10M in Western Canada." },
    { date: "2025-11-20", name: "Dan Selis", phone: "6198187147", email: "dan@selisadvisors.com", role: "Independent Sponsor", url: "https://www.selisadvisors.com", deals: "3-10", message: "Looking for several platform acquisitions and numerous add-ons. Very interested in how Captarget can help." },
  ];

  return raw.map((r, i) => createLead(r, i, "Contact Form"));
}

// Parse free targets form leads
function parseTargetLeads(): Lead[] {
  const raw: Array<{
    date: string; firstName: string; lastName: string; email: string;
    role: string; url: string; criteria: string; revenue: string;
    geography: string; deals: string; sourcing: string;
  }> = [
    { date: "2026-02-27", firstName: "Alexander", lastName: "Kurian", email: "alexander@operatewise.com", role: "Independent Sponsor / Search Fund", url: "https://operatewisecapital.replit.app", criteria: "$1M-$5M EBITDA, B2B services, Governance Risk & Compliance, Digital Infrastructure & Security", revenue: "$15M-$30M", geography: "US", deals: "Planning", sourcing: "Manual outreach + databases (Grata, Pitchbook)" },
    { date: "2026-02-27", firstName: "David", lastName: "Frankel", email: "dfrankel11@gmail.com", role: "Independent Sponsor / Search Fund", url: "https://www.linkedin.com/in/david-frankel/", criteria: "Robotics & industrial automation field services, $5M-$20M EBITDA, 15%+ margins, 40%+ recurring revenue", revenue: "$50M+", geography: "US, ideally northeast", deals: "0-2", sourcing: "Manual outreach + databases, Broker/Banker relationships" },
    { date: "2026-02-27", firstName: "Frank", lastName: "Vicich", email: "pivotalexportsolutionsltd@gmail.com", role: "Investment Banker / M&A Advisor / Broker", url: "https://www.pivotal-export-solutions-limited.com/", criteria: "Family/entrepreneur-owned, corporate carve-outs, technology and professional services, healthcare, industrial", revenue: "$1M-$50M+", geography: "US National", deals: "6+", sourcing: "Manual outreach, Broker relationships, Referrals" },
    { date: "2026-02-25", firstName: "Omar", lastName: "Garcia", email: "omar@teocapitalpartners.com", role: "Family Office", url: "teocapitalpartners.com", criteria: "Energy and utility service businesses", revenue: "$15M-$30M", geography: "Texas, southwest", deals: "3-4", sourcing: "Internal BD team" },
    { date: "2026-02-25", firstName: "David", lastName: "Mathewd", email: "z545ysc0l@mozmail.com", role: "Private Equity", url: "", criteria: "Good", revenue: "$5M-$15M", geography: "Google", deals: "0-2", sourcing: "Broker/Banker relationships" },
    { date: "2026-02-24", firstName: "Ian", lastName: "Spear", email: "ispear@rolandgrouplp.com", role: "Independent Sponsor / Search Fund", url: "https://rolandgrouplp.com/", criteria: "Interventional psychiatry practices offering TMS and/or Spravado. Founder-owned.", revenue: "$1M-$5M", geography: "US, preferably Northeast, Mid-Atlantic, Southeast", deals: "0-2", sourcing: "Manual outreach + databases" },
    { date: "2026-02-24", firstName: "Sascha", lastName: "van Holt", email: "vanholt@crosslantic.com", role: "Private Equity", url: "www.crosslantic.com", criteria: "B2B service businesses >4m EBITDA or smaller property management companies in Southeast", revenue: "$1M-$50M+", geography: "US", deals: "3-4", sourcing: "Broker relationships, Referrals/Network" },
    { date: "2026-02-16", firstName: "Sean", lastName: "McNally", email: "s.mcnally@permanentcorp.com", role: "Private Equity", url: "https://permanentcorp.com/", criteria: "Proprietary industrial products, $5-15m revenue, founder-owned, consistent profitability", revenue: "$5M-$15M", geography: "Canada, UK, USA", deals: "4-6", sourcing: "Internal BD, Manual outreach, Broker relationships, Referrals" },
    { date: "2026-02-11", firstName: "Chirag", lastName: "Oberoi", email: "cko12@proton.me", role: "Business Owner", url: "oiioholding.com", criteria: "Specialty Food Distributor/CPG brand/Food co-packer, Revenue $3-6M, EBITDA $500k-1.5M", revenue: "$1M-$15M", geography: ">100mi radius of Dallas, Southeast, US National", deals: "0-2", sourcing: "Broker relationships, Buy-side firms" },
    { date: "2026-02-11", firstName: "Barry", lastName: "Andrews", email: "barry.andrewshvac@gmail.com", role: "Business Owner", url: "https://nationalairwarehouse.com", criteria: "HVAC companies, majority commercial, southeast US. Founder owned & PE backed.", revenue: "$1M-$50M", geography: "Southeast U.S.", deals: "0-2", sourcing: "Exploring options" },
    { date: "2026-02-06", firstName: "Samuel", lastName: "Morales", email: "smorales@northgateinternational.com", role: "Private Equity", url: "northgateinternational.com", criteria: "Logistics Companies (Trucking, Warehousing, 3PL, Brokerage), Min 1.5M EBITDA", revenue: "$1M-$50M+", geography: "US, priority Miami/Florida", deals: "3-4", sourcing: "Broker relationships, Buy-side firms" },
    { date: "2026-02-04", firstName: "Ivo", lastName: "Veldkamp", email: "ivo.veldkamp@laudicom.ca", role: "Family Office", url: "www.castormarine.com", criteria: "3-10M revenue, B2B, technology/telecom/IT, no franchise. Operating in Vancouver", revenue: "$5M-$15M", geography: "Canada", deals: "0-2", sourcing: "Exploring options" },
    { date: "2026-02-04", firstName: "Steven", lastName: "Galanis", email: "s.galanis.ic@gmail.com", role: "Independent Sponsor / Search Fund", url: "https://xyragroup.com/", criteria: "Digital and online companies, eCommerce to SaaS, tech and media. Founder-owned, positive cash flows, 3+ years", revenue: "$1M-$50M", geography: "Worldwide - Remote", deals: "4-6", sourcing: "Internal BD, Manual outreach, Broker relationships" },
    { date: "2026-02-03", firstName: "Sean", lastName: "Nguyen", email: "sean@clearstonecapitaladvisors.com", role: "Family Office", url: "clearstonecapitaladvisors.com", criteria: "Landscaping companies in CA, owner retiring, above 1.5M revenue", revenue: "$1M-$5M", geography: "California, preferably Southern California", deals: "0-2", sourcing: "Referrals / Network" },
    { date: "2026-02-02", firstName: "Randy", lastName: "Boomhour", email: "randy.boomhour@cematrix.com", role: "Operating (Portfolio) Company", url: "", criteria: "Specialty construction (cellular concrete, grouting), $5-20M revenue, B2B commercial/industrial", revenue: "$5M-$15M", geography: "Southern USA, ideally Florida or Texas", deals: "0-2", sourcing: "Internal BD, Manual outreach, Broker relationships" },
    { date: "2026-02-02", firstName: "Jack", lastName: "Reinhart", email: "jrrein98@gmail.com", role: "Private Equity", url: "", criteria: "Pet Services, multi-location daycare, boarding, grooming. $2-5M EBITDA, at least $1M EBITDA", revenue: "$5M-$15M", geography: "US", deals: "0-2", sourcing: "Manual outreach + databases" },
    { date: "2026-02-01", firstName: "Thomas", lastName: "Campbell", email: "thomaswashingtoncampbell3@gmail.com", role: "Private Equity", url: "", criteria: "Geothermal Energy Power Company", revenue: "$50M+", geography: "Philippines", deals: "0-2", sourcing: "Exploring options" },
    { date: "2026-02-01", firstName: "Tyler", lastName: "Sun", email: "tylersun773@gmail.com", role: "Independent Sponsor / Search Fund", url: "", criteria: "Legal services, ALSPs, legal tech. Emerging manager friendly, active deployment.", revenue: "$5M-$15M", geography: "US", deals: "3-4", sourcing: "Referrals / Network" },
    { date: "2026-01-31", firstName: "Zeld", lastName: "Alliance", email: "support@zeldalliance.com", role: "Corp Dev / M&A Team", url: "", criteria: "Business Services, SaaS, Healthcare, Staffing, Home Services. $1.5M-$5M Revenue or 30% EBITDA", revenue: "$1M-$5M", geography: "Canada and USA", deals: "6+", sourcing: "Broker relationships, Buy-side firms" },
    { date: "2026-01-30", firstName: "W", lastName: "Tuchfarber", email: "wtuchfarber@flexpointford.com", role: "Private Equity", url: "", criteria: "Mental health focused specialty pharmacies", revenue: "$15M-$30M", geography: "USA", deals: "0-2", sourcing: "Exploring options" },
    { date: "2026-01-29", firstName: "Adam", lastName: "Haile", email: "adam.haile@sourcecodeals.com", role: "Operating (Portfolio) Company", url: "", criteria: "Test criteria", revenue: "$5M-$30M", geography: "Test geo", deals: "0-2", sourcing: "Internal BD, Manual outreach, Broker, Buy-side, Referrals" },
  ];

  return raw.map((r, i) => ({
    id: `TGT-${String(i + 1).padStart(3, "0")}`,
    name: `${r.firstName} ${r.lastName}`.trim(),
    email: r.email,
    phone: "",
    company: extractCompany(r.url || r.email),
    companyUrl: r.url,
    role: r.role,
    source: "Free Targets Form" as LeadSource,
    dateSubmitted: r.date,
    message: r.criteria,
    dealsPlanned: r.deals,
    stage: "New Lead" as const,
    serviceInterest: "TBD" as const,
    dealValue: 0,
    assignedTo: "",
    meetingDate: "",
    meetingSetDate: "",
    hoursToMeetingSet: null,
    daysInCurrentStage: daysSince(r.date),
    stageEnteredDate: r.date,
    closeReason: "" as const,
    closedDate: "",
    notes: "",
    lastContactDate: "",
    nextFollowUp: "",
    priority: "Medium" as const,
    targetCriteria: r.criteria,
    targetRevenue: r.revenue,
    geography: r.geography,
    currentSourcing: r.sourcing,
  }));
}

function extractCompany(urlOrEmail: string): string {
  if (!urlOrEmail) return "";
  try {
    if (urlOrEmail.includes("@")) {
      const domain = urlOrEmail.split("@")[1];
      if (["gmail.com", "hotmail.com", "icloud.com", "outlook.com", "yahoo.com", "proton.me"].includes(domain)) return "";
      return domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
    }
    const url = new URL(urlOrEmail.startsWith("http") ? urlOrEmail : `https://${urlOrEmail}`);
    const parts = url.hostname.replace("www.", "").split(".");
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  } catch {
    return urlOrEmail;
  }
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date("2026-03-02");
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function createLead(r: { date: string; name: string; phone: string; email: string; role: string; url: string; deals: string; message: string }, idx: number, source: LeadSource): Lead {
  return {
    id: `CT-${String(idx + 1).padStart(3, "0")}`,
    name: r.name,
    email: r.email,
    phone: r.phone,
    company: extractCompany(r.url || r.email),
    companyUrl: r.url,
    role: r.role,
    source,
    dateSubmitted: r.date,
    message: r.message,
    dealsPlanned: r.deals,
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
    targetCriteria: "",
    targetRevenue: "",
    geography: "",
    currentSourcing: "",
  };
}

// Deduplicate by email, keeping the most recent
function deduplicateLeads(leads: Lead[]): Lead[] {
  const map = new Map<string, Lead>();
  const sorted = [...leads].sort((a, b) => new Date(b.dateSubmitted).getTime() - new Date(a.dateSubmitted).getTime());
  for (const lead of sorted) {
    const key = lead.email.toLowerCase();
    if (!map.has(key)) {
      map.set(key, lead);
    } else {
      // Merge target criteria if the existing lead doesn't have it
      const existing = map.get(key)!;
      if (!existing.targetCriteria && lead.targetCriteria) {
        existing.targetCriteria = lead.targetCriteria;
        existing.targetRevenue = lead.targetRevenue;
        existing.geography = lead.geography;
        existing.currentSourcing = lead.currentSourcing;
      }
    }
  }
  return Array.from(map.values());
}

export function getInitialLeads(): Lead[] {
  const contacts = parseContactLeads();
  const targets = parseTargetLeads();
  return deduplicateLeads([...contacts, ...targets]);
}
