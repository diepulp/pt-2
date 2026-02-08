'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faqs = [
  {
    question: 'What is Player Tracker for?',
    answer:
      'Player Tracker is a shift-ready CRM for table games operations. It tracks player sessions, rewards, visits, and floor activity for card rooms.',
  },
  {
    question: 'Who is it for?',
    answer:
      'Pit bosses, shift managers, operations leads, and casino administrators who need consistent, auditable player tracking.',
  },
  {
    question: 'What happens after I sign in?',
    answer:
      'Start Gateway checks your account status and routes you to the right step — bootstrap (new tenant), setup (incomplete config), or straight into the app.',
  },
  {
    question: 'Do I need to set up tables first?',
    answer:
      'Yes. After creating your casino workspace, the Setup Wizard guides you through configuring areas, tables, and game defaults before the app is fully operational.',
  },
  {
    question: 'Can one user manage multiple casinos?',
    answer:
      'Not in the current version. Each staff account is bound to one casino. Multi-casino support is a future consideration.',
  },
  {
    question: 'Do you have billing?',
    answer:
      'Not yet. We\u2019re in pilot/early access. Contact us to discuss access and pricing.',
  },
  {
    question: 'How is data secured?',
    answer:
      'All app routes are auth-protected. Data is isolated per casino via staff binding and row-level security policies.',
  },
];

export function FAQSection() {
  return (
    <section id="faq" className="py-16 md:py-20 lg:py-24">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl md:text-4xl font-semibold mb-10">
          Common questions.
        </h2>
        <Accordion type="single" collapsible className="max-w-2xl">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-muted-foreground">{faq.answer}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
