import type { Metadata } from "next";
import LegalPage, { A, type Section } from "@/components/LegalPage";
import { CONTACT_EMAIL, SITE_HOST, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy — CodePath",
  description:
    "How CodePath handles your Google account information, your course data, and the code and messages you submit.",
};

const UPDATED = "25 July 2026";
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
            of CodePath is the data controller.
          </>
        ),
      },
    ],
  },
  {
    heading: "What we collect",
    blocks: [
      { p: "We collect four things, and nothing else." },
      {
        list: [
          <>
            <strong className="font-semibold text-ink">Your Google account basics.</strong> When
            you sign in with Google we receive your name, email address, profile picture URL and
            Google account identifier. We request only the basic profile and email scopes — we
            never ask for access to your Gmail, Drive, Calendar, Contacts or any other Google
            service, and we cannot read them.
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
            <strong className="font-semibold text-ink">Ordinary server logs.</strong> Our host
            records requests to the site, which includes IP addresses and browser user-agent
            strings, for security and debugging.
          </>,
        ],
      },
      {
        p: (
          <>
            We do not use analytics, advertising or tracking cookies, and there are no third-party
            trackers on the site. The only things stored in your browser are your sign-in session
            and small preferences such as how you sort your course list.
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
            CodePath&rsquo;s use and transfer to any other app of information received from Google
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
        p: "CodePath is built on a small number of services. Each one sees only what it needs to do its job.",
      },
      {
        list: [
          <>
            <strong className="font-semibold text-ink">Supabase</strong> — authentication and the
            database. Holds your account record and all of your course data, progress and tutor
            conversations.
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
            Aloud, the text of that lesson is sent to Microsoft&rsquo;s speech service to be turned
            into audio. Nothing about you is sent with it. If you never press it, Microsoft
            receives nothing.
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
    heading: "How long we keep it",
    blocks: [
      {
        list: [
          "Course data, progress and tutor conversations: until you delete the course, or delete your account.",
          "Your account record: until you ask us to delete it.",
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
            have it erased. Much of this you can do yourself: rename or delete any course from the
            app, and sign out at any time.
          </>
        ),
      },
      {
        p: (
          <>
            To delete your account and everything attached to it, or to receive a copy of your data,
            email <A href={`mailto:${CONTACT}`}>{CONTACT}</A> from the address you signed up with.
            We will action it within 30 days. You can also revoke CodePath&rsquo;s access to your
            Google account at any time from{" "}
            <A href="https://myaccount.google.com/permissions">
              your Google account permissions page
            </A>
            , which stops any future sign-in; email us as well if you also want the data we already
            hold erased.
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
        p: "Traffic is encrypted in transit. Access to the database is restricted, and sign-in is handled by Google and Supabase rather than by us — we never see or store your Google password. No service can promise perfect security, and this one is a personal project rather than an enterprise product; please keep that in mind when deciding what to put into it.",
      },
    ],
  },
  {
    heading: "Children",
    blocks: [
      {
        p: "CodePath is not intended for children under 16. We do not knowingly collect data from them. If you believe a child has given us data, email us and we will delete it.",
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
          CodePath is a learning app. You sign in with Google, describe what you want to learn, and
          it builds you a course you work through in the browser. This page explains exactly what
          that involves for your data — what we receive, what we do with it, who else sees it, and
          how to get rid of it.
        </>
      }
      sections={sections}
    />
  );
}
