import type { Metadata } from "next";
import LegalPage, { A, type Section } from "@/components/LegalPage";
import { CONTACT_EMAIL, SITE_HOST, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy — CodeChad",
  description:
    "How CodeChad handles your account information, your course data, and the code and messages you submit.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "27 July 2026";
const CONTACT = CONTACT_EMAIL;

const sections: Section[] = [
  {
    heading: "Who we are",
    blocks: [
      {
        p: (
          <>
            {SITE_NAME} is an independent, non-commercial learning app run by a solo developer based
            in Portugal, at <A href={SITE_URL}>{SITE_HOST}</A>.
            For anything in this policy, including requests about your data, write to{" "}
            <A href={`mailto:${CONTACT}`}>{CONTACT}</A> — that address reaches the operator
            directly. For the purposes of the EU General Data Protection Regulation, the operator
            of CodeChad is the data controller.
          </>
        ),
      },
    ],
  },
  {
    heading: "What we collect",
    blocks: [
      { p: "We collect five things, and nothing else." },
      {
        list: [
          <>
            <strong className="font-semibold text-ink">Your account basics.</strong> There are
            three ways to sign in, and each gives us a little less than the last.
            <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 marker:text-ink-faint">
              <li>
                <strong className="font-semibold text-ink">Google.</strong> We receive your name,
                email address, profile picture URL and Google account identifier. We request only
                the basic profile and email scopes — we never ask for access to your Gmail, Drive,
                Calendar, Contacts or any other Google service, and we cannot read them.
              </li>
              <li>
                <strong className="font-semibold text-ink">GitHub.</strong> We receive your
                username, email address, avatar URL and GitHub account identifier. We ask for no
                repository access of any kind and cannot see your code, private or public.
              </li>
              <li>
                <strong className="font-semibold text-ink">Email and password.</strong> We receive
                only your email address. Your password is sent straight to Supabase, our
                authentication provider, which stores it hashed — the operator of CodeChad never
                sees it, and it is never written to our database in a readable form.
              </li>
            </ul>
          </>,
          <>
            <strong className="font-semibold text-ink">Your course data.</strong> The technology
            you chose, the level and goal you described, the roadmap generated for you, which
            lessons you have completed, and the name you give a course.
          </>,
          <>
            <strong className="font-semibold text-ink">What you write in the app.</strong> Your
            messages to the AI tutor and the code you write and submit for grading.
          </>,
          <>
            <strong className="font-semibold text-ink">Feedback you send us.</strong> If you use
            the feedback button, we store what you wrote, which of the four categories you picked,
            and which page and module you were on when you wrote it — that last part is what makes
            &ldquo;this is confusing&rdquo; actionable. The email address is optional and used only
            to reply. You can send feedback without being signed in, and if you do, we store no
            identifier for you at all.
          </>,
          <>
            <strong className="font-semibold text-ink">Ordinary server logs.</strong> Our host
            records requests to the site, which includes IP addresses and browser user-agent
            strings, for security and debugging. We also count requests per IP address, in memory
            only, to stop one visitor exhausting the free allowance — those counts are never
            written to disk and disappear within the hour.
          </>,
        ],
      },
      {
        p: (
          <>
            We do not use analytics, advertising or tracking cookies, and there are no third-party
            trackers on the site. The only things stored in your browser are your sign-in session
            and small preferences such as how you sort your course list. If you sign in with an
            email and password, your browser may offer to remember them — that is your browser&rsquo;s
            own password manager, under your control, and nothing about it reaches us.
          </>
        ),
      },
    ],
  },
  {
    heading: "Why we use it",
    blocks: [
      {
        list: [
          "To sign you in and keep you signed in, and to attach your courses to your account.",
          "To generate a roadmap and lessons matched to the level and goal you described.",
          "To grade your exercises and let the AI tutor respond to what you actually wrote.",
          "To keep the service running and secure, and to diagnose faults.",
        ],
      },
      {
        p: (
          <>
            Under the GDPR, we process this data to perform the service you asked for
            (Article 6(1)(b)) and, for logs and security, on the basis of our legitimate interest
            in keeping the service available and safe (Article 6(1)(f)). We do not profile you and
            we make no automated decisions with legal effects.
          </>
        ),
      },
    ],
  },
  {
    heading: "Google user data and Limited Use",
    blocks: [
      {
        p: (
          <>
            CodeChad&rsquo;s use and transfer to any other app of information received from Google
            APIs will adhere to the{" "}
            <A href="https://developers.google.com/terms/api-services-user-data-policy">
              Google API Services User Data Policy
            </A>
            , including the Limited Use requirements.
          </>
        ),
      },
      { p: "In plain terms, and without exception:" },
      {
        list: [
          "We do not sell your Google account information, and we never have.",
          "We do not use it for advertising, and we show no ads.",
          "We do not use it to develop, improve or train generalised AI or machine-learning models.",
          "No human reads it, except where you have explicitly asked us to, where it is necessary for security purposes such as investigating abuse, or where the law requires it.",
          "We transfer it only to the providers listed below, only to operate the service, and only as much of it as they need.",
        ],
      },
    ],
  },
  {
    heading: "Who processes your data",
    blocks: [
      {
        p: "CodeChad is built on a small number of services. Each one sees only what it needs to do its job.",
      },
      {
        list: [
          <>
            <strong className="font-semibold text-ink">Supabase</strong> — authentication and the
            database. Holds your account record and all of your course data, progress and tutor
            conversations, and — if you sign in with an email and password — the hashed form of
            that password.
          </>,
          <>
            <strong className="font-semibold text-ink">GitHub</strong> — only if you choose to sign
            in with GitHub. GitHub authenticates you and tells us the account basics listed above.
            If you never use that button, GitHub receives nothing.
          </>,
          <>
            <strong className="font-semibold text-ink">Google (Gemini API)</strong> — generates
            roadmaps, lessons and tutor replies. It receives the learning goal and level you
            described, the topic being taught, your messages to the tutor and the code you submit
            for feedback. It does not receive your name, email address or account identifier.
          </>,
          <>
            <strong className="font-semibold text-ink">Vercel</strong> — hosting. Serves the site
            and keeps the request logs described above.
          </>,
          <>
            <strong className="font-semibold text-ink">Microsoft</strong> — only if you press Read
            Aloud. The text of that message or lesson is sent to Microsoft&rsquo;s speech service to
            be turned into audio, along with your IP address, because your browser makes that
            request. Nothing else about you is sent, and no account information goes with it. If you
            never press the button, Microsoft receives nothing.
          </>,
        ],
      },
      {
        p: (
          <>
            These providers may process data outside the European Economic Area. Where they do, the
            transfer relies on the safeguards those providers put in place, such as the European
            Commission&rsquo;s standard contractual clauses.
          </>
        ),
      },
      {
        p: (
          <>
            <strong className="font-semibold text-ink">
              Content delivery networks, and what they can see.
            </strong>{" "}
            The language runtimes that let your code execute in the browser — Python, SQL, Ruby,
            PHP, Lua, the compilers and the AI/ML models — are large, so they are not shipped with
            the page. Your browser fetches them, when you first run something in that module, from{" "}
            <A href="https://www.jsdelivr.com/">jsDelivr</A>,{" "}
            <A href="https://unpkg.com/">unpkg</A> and{" "}
            <A href="https://huggingface.co/">Hugging Face</A>. Opening the documentation pane
            similarly loads a page from <A href="https://devdocs.io/">DevDocs</A>.
          </>
        ),
      },
      {
        p: (
          <>
            Any request your browser makes to another company necessarily tells that company your{" "}
            <strong className="font-semibold text-ink">IP address</strong> and which file you asked
            for, and we want to be straightforward about it rather than leave it unsaid. These are
            developer infrastructure providers, not advertising networks: they set no cookie, they
            receive nothing about your account, and they cannot see your code, your lessons or your
            messages. If you never open a module or the docs pane, none of them are contacted at
            all.
          </>
        ),
      },
    ],
  },
  {
    heading: "Code you run",
    blocks: [
      {
        p: (
          <>
            Most of the code you write runs entirely inside your own browser, in a sandbox — Python,
            SQL, Ruby, PHP and Lua all execute locally through WebAssembly and never reach our
            servers just to run. Code is sent to us only when you ask the tutor about it or submit
            it for grading, and then only so the AI tutor can respond to it.
          </>
        ),
      },
      {
        p: "Please do not paste passwords, API keys, personal data or anything confidential into the editor or the chat.",
      },
    ],
  },
  {
    heading: "The AI tutor",
    blocks: [
      {
        p: (
          <>
            The tutor is an AI system, not a person. Every roadmap, lesson, explanation and reply
            you see in the chat panel is generated by a Google Gemini model in response to what you
            wrote. The app says so on screen, permanently, above the conversation — you are never
            meant to be in any doubt about it, and nobody is standing by reading your messages.
          </>
        ),
      },
      {
        p: (
          <>
            Generated text can be wrong, including when it sounds certain, so check anything that
            matters against the official documentation. Nothing you write is used to train AI
            models — not by us, and not, under the paid API terms we use, by Google. Grading is not
            an AI judgement about you: it runs your code and checks the result, it has no
            consequence outside your own progress bar, and no decision with any legal or similarly
            significant effect is made about you automatically.
          </>
        ),
      },
    ],
  },
  {
    heading: "How long we keep it",
    blocks: [
      {
        list: [
          "Course data, progress and tutor conversations: until you delete the course, or delete your account.",
          "Your account record: until you delete it, which you can do yourself at any time.",
          "Feedback you sent while signed in: until you delete your account, which takes it with it.",
          "Feedback you sent while signed out: kept until we have acted on it. It carries no identifier, so we cannot connect it to you or find it again on request — that is the trade for being able to send it without an account.",
          "Rate-limiting counts: in memory only, for at most an hour.",
          "Server logs: for the short period our host retains them, in the ordinary course of operating the site.",
        ],
      },
      {
        p: (
          <>
            Deleting a course from the landing page removes its roadmap, its progress and its chat
            history immediately and permanently. There is no undo, and we keep no backup copy for
            you.
          </>
        ),
      },
    ],
  },
  {
    heading: "Your rights",
    blocks: [
      {
        p: (
          <>
            You can access, correct, export, restrict or object to our use of your data, and you can
            have it erased. Most of this you can do yourself, immediately, without asking us and
            without waiting:
          </>
        ),
      },
      {
        list: [
          <>
            <strong className="font-semibold text-ink">Get a copy of everything</strong> — Account
            settings → Your data → <em>Download my data</em>. It produces a JSON file containing
            every row attached to your account: your profile, your courses and roadmaps, your
            progress and submitted code, every conversation with the tutor, and any feedback you
            sent while signed in. That covers both your right of access and your right to data
            portability, and there is nothing we hold back from it.
          </>,
          <>
            <strong className="font-semibold text-ink">Correct it</strong> — your display name,
            email address and password are all editable in Account settings.
          </>,
          <>
            <strong className="font-semibold text-ink">Delete a course</strong> — from the landing
            page. Its roadmap, progress and chat history go with it, at once.
          </>,
          <>
            <strong className="font-semibold text-ink">Delete your account</strong> — Account
            settings → Danger zone. It is immediate and it cascades: the account record and
            everything attached to it are removed by the database itself. There is no soft delete,
            no grace period and no backup copy kept for you. Download your data first if you want
            to keep it.
          </>,
        ],
      },
      {
        p: (
          <>
            If you would rather we did it, or you want something the app cannot do for you — to
            object to a particular use, or to ask us to restrict it — email{" "}
            <A href={`mailto:${CONTACT}`}>{CONTACT}</A> from the address you signed up with and we
            will action it within 30 days. You can also cut off future sign-ins yourself: revoke
            CodeChad from{" "}
            <A href="https://myaccount.google.com/permissions">
              your Google account permissions page
            </A>{" "}
            or from{" "}
            <A href="https://github.com/settings/applications">
              your GitHub authorised applications page
            </A>
            . Revoking stops any future sign-in but does not erase what we already hold — email us
            as well if you want that too.
          </>
        ),
      },
      {
        p: "If you believe we have handled your data badly, you may complain to your national data protection authority. In Portugal, that is the CNPD.",
      },
    ],
  },
  {
    heading: "Security",
    blocks: [
      {
        p: "Traffic is encrypted in transit, and access to the database is restricted to the app's own server code. Sign-in is handled by Google, GitHub and Supabase rather than by us: we never see your Google or GitHub password, and a password you set for CodeChad itself goes to Supabase to be hashed rather than being stored by us in a form anyone could read. No service can promise perfect security, and this one is a personal project rather than an enterprise product; please keep that in mind when deciding what to put into it.",
      },
    ],
  },
  {
    heading: "Children",
    blocks: [
      {
        p: "CodeChad is not intended for children under 16. We do not knowingly collect data from them. If you believe a child has given us data, email us and we will delete it.",
      },
    ],
  },
  {
    heading: "Changes to this policy",
    blocks: [
      {
        p: (
          <>
            If this policy changes we will update the date at the top of this page. Where a change
            materially affects how we handle your data, we will make that clear in the app before it
            takes effect.
          </>
        ),
      },
    ],
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={UPDATED}
      intro={
        <>
          CodeChad is a learning app. You sign in with Google, with GitHub, or with an email address
          and password, describe what you want to learn, and it builds you a course you work through
          in the browser. This page explains exactly what that involves for your data — what we
          receive, what we do with it, who else sees it, and how to get rid of it.
        </>
      }
      sections={sections}
    />
  );
}
