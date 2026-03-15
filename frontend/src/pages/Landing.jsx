import ScrollVideo from '../components/ScrollVideo';
import ExpandingCTA from '../components/ExpandingCTA';
import ScrollTextSection from '../components/ScrollTextSection';
import HorizontalInfoSection from '../components/HorizontalInfoSection';
import StackingCards from '../components/StackingCards';
import ExpandCards from '../components/ExpandCards';
import ScrollRevealText from '../components/ScrollRevealText';
import RevealFooter from '../components/RevealFooter';

export default function Landing() {
  return (
    <>
      {/* Footer sits fixed behind everything */}
      <RevealFooter />

      {/* Main content sits on top, z-index 2 */}
      <div style={{ background: 'var(--bg-primary)', position: 'relative', zIndex: 2 }}>
        {/* Section 1: Scroll-animated video hero */}
        <ScrollVideo />

        {/* Section 2: Expanding box CTA with register/learn more */}
        <ExpandingCTA />

        {/* Section 3: About project with pinned text animations */}
        <ScrollTextSection />

        {/* Section 4: Horizontal pinned info cards */}
        <HorizontalInfoSection />

        {/* Section 5: Stacking cards */}
        <StackingCards />

        {/* Section 6: Expand on hover cards */}
        <ExpandCards />

        {/* Section 7: Scroll reveal text with hover panels */}
        <ScrollRevealText />
      </div>

      {/* Spacer to allow footer reveal — the main content scrolls away and the footer is revealed */}
      <div style={{ height: '100vh', position: 'relative', zIndex: 2, pointerEvents: 'none' }} />
    </>
  );
}
