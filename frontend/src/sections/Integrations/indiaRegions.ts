export type RegionKind = "State" | "Union territory";

export type RegionInfo = {
  officialName: string;
  capital: string;
  kind: RegionKind;
};

// Administrative names and capitals cross-checked against the National Portal of India
// state/UT reference and the current state/UT capital table (including qualified capitals).
export const REGION_INFO: Record<string, RegionInfo> = {
  "Andhra Pradesh": {
    officialName: "Andhra Pradesh",
    capital: "Amaravati",
    kind: "State",
  },
  "Arunachal Pradesh": {
    officialName: "Arunachal Pradesh",
    capital: "Itanagar",
    kind: "State",
  },
  Assam: { officialName: "Assam", capital: "Dispur", kind: "State" },
  Bihar: { officialName: "Bihar", capital: "Patna", kind: "State" },
  Chhattisgarh: {
    officialName: "Chhattisgarh",
    capital: "Raipur",
    kind: "State",
  },
  Goa: { officialName: "Goa", capital: "Panaji", kind: "State" },
  Gujarat: { officialName: "Gujarat", capital: "Gandhinagar", kind: "State" },
  Haryana: { officialName: "Haryana", capital: "Chandigarh", kind: "State" },
  "Himachal Pradesh": {
    officialName: "Himachal Pradesh",
    capital: "Shimla (summer); Dharamshala (winter)",
    kind: "State",
  },
  Jharkhand: { officialName: "Jharkhand", capital: "Ranchi", kind: "State" },
  Karnataka: { officialName: "Karnataka", capital: "Bengaluru", kind: "State" },
  Kerala: {
    officialName: "Kerala",
    capital: "Thiruvananthapuram",
    kind: "State",
  },
  "Madhya Pradesh": {
    officialName: "Madhya Pradesh",
    capital: "Bhopal",
    kind: "State",
  },
  Maharashtra: {
    officialName: "Maharashtra",
    capital: "Mumbai (summer); Nagpur (winter)",
    kind: "State",
  },
  Manipur: { officialName: "Manipur", capital: "Imphal", kind: "State" },
  Meghalaya: { officialName: "Meghalaya", capital: "Shillong", kind: "State" },
  Mizoram: { officialName: "Mizoram", capital: "Aizawl", kind: "State" },
  Nagaland: { officialName: "Nagaland", capital: "Kohima", kind: "State" },
  Odisha: { officialName: "Odisha", capital: "Bhubaneswar", kind: "State" },
  Punjab: { officialName: "Punjab", capital: "Chandigarh", kind: "State" },
  Rajasthan: { officialName: "Rajasthan", capital: "Jaipur", kind: "State" },
  Sikkim: { officialName: "Sikkim", capital: "Gangtok", kind: "State" },
  "Tamil Nadu": {
    officialName: "Tamil Nadu",
    capital: "Chennai",
    kind: "State",
  },
  Telangana: { officialName: "Telangana", capital: "Hyderabad", kind: "State" },
  Tripura: { officialName: "Tripura", capital: "Agartala", kind: "State" },
  "Uttar Pradesh": {
    officialName: "Uttar Pradesh",
    capital: "Lucknow",
    kind: "State",
  },
  Uttarakhand: {
    officialName: "Uttarakhand",
    capital: "Bhararisain (summer); Dehradun (winter)",
    kind: "State",
  },
  "West Bengal": {
    officialName: "West Bengal",
    capital: "Kolkata",
    kind: "State",
  },
  "Andaman and Nicobar Islands": {
    officialName: "Andaman and Nicobar Islands",
    capital: "Port Blair",
    kind: "Union territory",
  },
  Chandigarh: {
    officialName: "Chandigarh",
    capital: "Chandigarh",
    kind: "Union territory",
  },
  "Dadra and Nagar Haveli and Daman and Diu": {
    officialName: "Dadra and Nagar Haveli and Daman and Diu",
    capital: "Daman",
    kind: "Union territory",
  },
  Delhi: {
    officialName: "National Capital Territory of Delhi",
    capital: "New Delhi",
    kind: "Union territory",
  },
  "Jammu and Kashmir": {
    officialName: "Jammu and Kashmir",
    capital: "Srinagar (summer); Jammu (winter)",
    kind: "Union territory",
  },
  Ladakh: {
    officialName: "Ladakh",
    capital: "Leh (summer); Kargil (joint capital)",
    kind: "Union territory",
  },
  Lakshadweep: {
    officialName: "Lakshadweep",
    capital: "Kavaratti",
    kind: "Union territory",
  },
  Puducherry: {
    officialName: "Puducherry",
    capital: "Puducherry",
    kind: "Union territory",
  },
};

export const REGION_COUNT = 36;
