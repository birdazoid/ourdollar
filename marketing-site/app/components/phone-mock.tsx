import Image from 'next/image';

/** The hero's phone shot — a real screenshot of the Week screen. */
export function PhoneMock() {
  return (
    <div className="hero-visual" data-parallax="0.05">
      <div className="hero-phone-shot" data-image-reveal>
        <Image
          src="/screenshots/week-iphone.png"
          alt="OurDollar's Week screen on a phone, showing this week's free-to-spend amount and planned spending categories"
          width={529}
          height={1068}
          priority
        />
      </div>
    </div>
  );
}
