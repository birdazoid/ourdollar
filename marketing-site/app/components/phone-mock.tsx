import Image from 'next/image';

/** Supplied Week screenshot inside a lightweight, responsive device frame. */
export function PhoneMock() {
  return (
    <div className="hero-visual">
      <div className="hero-phone-shot">
        <div className="hero-device">
          <div className="hero-device-screen">
            <Image
              src="/screenshots/week-current.svg"
              alt="OurDollar Week screen: $621.85 free to spend this week, planned spending, recent household purchases, and navigation."
              width={1320}
              height={2868}
              priority
              unoptimized
            />
          </div>
        </div>
      </div>
    </div>
  );
}
