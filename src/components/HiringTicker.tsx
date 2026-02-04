"use client";

export default function HiringTicker() {
  const locations = [
    "Chicago, IL",
    "Dayton, OH",
    "Grand Rapids, MI",
    "Lansing, MI",
    "Indianapolis, IN",
    "Lexington, KY",
    "Denver, CO",
    "Phoenix, AZ",
    "Albuquerque, NM",
    "Lubbock, TX",
    "Dallas, TX",
    "Birmingham, AL",
    "Atlanta, GA",
    "Savannah, GA",
    "Jacksonville, FL",
    "Tallahassee, FL",
    "Charleston, WV",
    "Baltimore, MD",
    "Philadelphia, PA",
    "Pittsburgh, PA",
  ];

  // Duplicate for seamless loop
  const tickerContent = [...locations, ...locations];

  return (
    <div className="hiring-ticker">
      <div className="hiring-ticker-content">
        {tickerContent.map((location, index) => (
          <span key={index} className="hiring-ticker-item">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            Now Hiring in {location}
          </span>
        ))}
      </div>
    </div>
  );
}
