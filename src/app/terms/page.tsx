import type { Metadata } from "next";
import LegalPage, { A, type Section } from "@/components/LegalPage";
import { CONTACT_EMAIL, SITE_HOST, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service — CodeChad",
  description:
    "The terms you agree to when you use CodeChad: what the service is, what is expected of you, and the limits of what it promises.",
  alternates: { canonical: "/terms" },
};

const UPDATED = "28 July 2026";
const CONTACT = CONTACT_EMAIL;

const sections: Section[] = [
  {
    heading: "Agreeing to these terms",
    blocks: [
      {
        p: (
          <>
            By using {SITE_NAME} at{" "}
            <A href={SITE_URL}>{SITE_HOST}</A> you agree to these
            terms. If you do not agree with them, please do not use the service. They are a contract
            between you and the operator of CodeChad, a solo developer based in Portugal, reachable
            at <A href={`mailto:${CONTACT}`}>{CONTACT}</A>.
          </>
        ),
      },
    ],
  },
  {
    heading: "What CodeChad is",
    blocks: [
      {
        p: "CodeChad generates a personalised learning roadmap for a programming language or database, then teaches it lesson by lesson with an AI tutor, in an editor that runs your code live in the browser.",
      },
      {
        p: "It is beta software and a personal project. Features change, break and disappear. Everything that teaches you is free of charge, and there is no guarantee that it will keep working, keep your data, or continue to exist.",
      },
    ],
  },
  {
    heading: "Subscriptions and payment",
    blocks: [
      {
        p: "Everything that teaches you is free: every technology, every career path, the AI tutor, the editor and the grading. The optional subscription changes one thing — free accounts can keep 3 courses at a time, and a subscription removes that limit. Nothing you have already made stops working if you do not subscribe, or if you subscribe and later stop.",
      },
      {
        p: "The price and billing period are shown on the pricing page before you buy, and include VAT at the rate for your country, which is calculated at checkout. Payment is taken by Stripe on their own site; we never receive or store your card details. Subscriptions renew automatically at the end of each period until you cancel.",
      },
      {
        p: "You can cancel at any time from Account settings, and it takes effect at the end of the period you have already paid for — you keep what you paid for and are not charged again. Cancelling is deliberately no harder than subscribing: no retention offers, no extra steps.",
      },
      {
        p: "If a renewal payment fails we will retry it. Your access is not cut off while that is happening; if it ultimately fails, the subscription ends and your account returns to the free tier with your courses intact.",
      },
    ],
  },
  {
    heading: "Your right to withdraw",
    blocks: [
      {
        p: "If you are a consumer in the EU you have 14 days from the day the contract is concluded to withdraw from it, without giving any reason. This is separate from cancelling, and there is a button for it in Account settings labelled “Withdraw from the contract here”, available for the whole 14 days.",
      },
      {
        p: "At checkout you are asked to confirm two things separately: that you want the subscription to start immediately rather than after the withdrawal period, and that you understand what that means for a refund. Because the service starts at once, if you withdraw you are refunded for the part of the period you have not used, and you pay only for the part you have. Withdrawing ends the subscription immediately and returns you to the free tier; your courses and progress are not deleted.",
      },
      {
        p: (
          <>
            You do not have to use the button. You may also withdraw by writing to{" "}
            <A href={`mailto:${CONTACT}`}>{CONTACT}</A>, in any clear terms, within the same
            14 days. Either way we confirm it to you and process the refund without undue
            delay.
          </>
        ),
      },
    ],
  },
  {
    heading: "Your account",
    blocks: [
      {
        p: "You sign in with a Google account, a GitHub account, or an email address and a password you choose. You are responsible for that account and for anything done through it on CodeChad. If you set a password here, choose one you do not use anywhere else, and keep it to yourself. Tell us promptly if you believe someone else has used your account.",
      },
      {
        p: "You must be at least 16 years old to use CodeChad.",
      },
    ],
  },
  {
    heading: "Acceptable use",
    blocks: [
      { p: "Use CodeChad to learn. Do not:" },
      {
        list: [
          "Attempt to break out of the code sandbox, attack the service or its providers, or interfere with anyone else's use of it.",
          "Use the AI tutor to generate malware, content that harms others, or anything unlawful.",
          "Automate or scrape the service, or resell access to it.",
          "Upload personal data about other people, credentials or confidential material into the editor or chat.",
        ],
      },
      {
        p: "We may suspend or remove access if the service is being used this way. Given it is a free personal project, that decision is ours and may be immediate.",
      },
    ],
  },
  {
    heading: "AI-generated content",
    blocks: [
      {
        p: "Roadmaps, lessons, explanations and tutor replies are generated by an AI model. They can be incomplete, out of date or simply wrong, including when they sound confident. Exercise grading is deterministic — it runs your code and checks the result — but the teaching around it is not.",
      },
      {
        p: "Check anything that matters against the official documentation for the technology you are learning. Do not rely on CodeChad for professional, security or legal decisions.",
      },
    ],
  },
  {
    heading: "Your content",
    blocks: [
      {
        p: "The code you write and the messages you send remain yours. You grant us only the permission needed to operate the service: to store that content, and to send it to the AI provider so it can respond to you. We do not use it to train AI models, and we do not publish it.",
      },
      {
        p: "The roadmaps and lessons the service generates for you are yours to use freely, for any purpose.",
      },
    ],
  },
  {
    heading: "Availability and changes",
    blocks: [
      {
        p: "There is no uptime commitment. The service may be unavailable, may lose data, and may be discontinued at any time without notice. Third-party pieces it depends on — Google's AI models, Supabase, the browser runtimes — may change or stop working, and some of them impose usage quotas that can make generation fail temporarily.",
      },
      {
        p: (
          <>
            Keep your own copy of anything you would be sorry to lose. See the{" "}
            <A href="/privacy">Privacy Policy</A> for what we store and how to get it deleted.
          </>
        ),
      },
    ],
  },
  {
    heading: "No warranty",
    blocks: [
      {
        p: "CodeChad is provided “as is” and “as available”, without warranties of any kind, express or implied, including fitness for a particular purpose, accuracy of content, or uninterrupted operation. Nothing here excludes rights you have as a consumer under mandatory law.",
      },
    ],
  },
  {
    heading: "Limitation of liability",
    blocks: [
      {
        p: "To the fullest extent the law allows, we are not liable for indirect or consequential loss, lost data, lost profits, or anything arising from your reliance on AI-generated content. Our total liability to you is limited to the amount you have paid us in the 12 months before the claim — which, if you have never subscribed, is nothing. Liability for death, personal injury, fraud, or anything else that cannot be excluded by law is unaffected, and nothing here limits your rights as a consumer under mandatory law, including your rights if the service is not as described.",
      },
    ],
  },
  {
    heading: "Ending it",
    blocks: [
      {
        p: (
          <>
            You may stop using CodeChad at any time. Delete individual courses from the
            landing page, cancel a subscription from Account settings, and delete your whole
            account from the same place — all of it immediate and none of it needing to go
            through us. Deleting your account cancels any subscription at the end of the
            period you have paid for; see the <A href="/privacy">Privacy Policy</A> for the
            one billing record that tax law requires us to keep. We may end your access if you
            breach these terms or if the service is discontinued; if we do so while you have
            paid for a period you have not used, we will refund the unused part.
          </>
        ),
      },
    ],
  },
  {
    heading: "Governing law",
    blocks: [
      {
        p: "These terms are governed by Portuguese law, and disputes fall to the courts of Portugal. If you are a consumer resident elsewhere in the EU, you keep the protection of the mandatory laws of your own country and may bring proceedings there.",
      },
    ],
  },
  {
    heading: "Changes to these terms",
    blocks: [
      {
        p: "We may update these terms. The date at the top of this page shows when they last changed, and continuing to use CodeChad after a change means you accept the new version.",
      },
    ],
  },
  {
    heading: "Contact",
    blocks: [
      {
        p: (
          <>
            Questions about these terms go to <A href={`mailto:${CONTACT}`}>{CONTACT}</A>.
          </>
        ),
      },
    ],
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={UPDATED}
      intro={
        <>
          CodeChad is in beta and run by one person. Everything that teaches you is free; an
          optional subscription only removes the limit on how many courses you can keep. These
          terms say what you can expect from it, what it expects from you, and what it does not
          promise — in particular that its AI tutor can be wrong and that your data is not
          guaranteed to survive.
        </>
      }
      sections={sections}
    />
  );
}
