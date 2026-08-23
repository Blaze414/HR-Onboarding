import { PRODUCT_NAME, PRODUCT_SUBTITLE } from '@snoopy/shared';
import { LoginForm } from '@/components/LoginForm';
import { SnoopyMark, WoodstockMark } from '@/components/Snoopy';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function LoginPage() {
  return (
    <div className="login-page">
      <section className="login-art">
        <div className="row" style={{ gap: 12 }}>
          <SnoopyMark size={36} />
          <WoodstockMark size={26} />
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <h2>Run the workplace<br />from one desk.</h2>
          <p>
            People, learning and work in one place. Assign courses, track onboarding,
            keep tasks moving, and see how every department is actually progressing.
          </p>
        </div>

        <div className="login-strip">
          <div className="login-panel">
            <span className="k">Learning</span>
            <span className="v">Courses &amp; progress</span>
          </div>
          <div className="login-panel">
            <span className="k">People</span>
            <span className="v">Onboarding plans</span>
          </div>
          <div className="login-panel">
            <span className="k">Work</span>
            <span className="v">Tasks &amp; events</span>
          </div>
        </div>
      </section>

      <section className="login-form-wrap">
        <div className="login-form">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span />
            <ThemeToggle />
          </div>
          <h1>{PRODUCT_NAME}</h1>
          <p className="muted" style={{ marginBottom: 22, marginTop: 6 }}>{PRODUCT_SUBTITLE}</p>
          <LoginForm />
        </div>
      </section>
    </div>
  );
}
