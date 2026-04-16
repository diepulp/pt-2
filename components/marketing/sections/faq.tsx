'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

import { Section } from '../section';

const faqs = [
  {
    question: 'What does Player Tracker replace?',
    answer:
      'Player Tracker replaces legacy table games systems — the combination of paper rating slips, standalone tracking software, spreadsheets, and manual logs that most card rooms use to manage their floor. It becomes your system of record for player sessions, ratings, cash activity, and loyalty.',
  },
  {
    question: 'Who is this built for?',
    answer:
      'Owner-operators, GMs, and operations leads at small card rooms and similar gaming properties. If you run a floor and feel limited by your current systems, this is for you.',
  },
  {
    question: 'Is this a compliance product?',
    answer:
      "No. Player Tracker is an operations platform with compliance built into the architecture — audit trails, immutable records, Title 31-aware cash tracking, and role-based access. It supports your compliance program; it doesn't replace it.",
  },
  {
    question: 'How long does setup take?',
    answer:
      'A guided setup wizard walks you through configuring your property — areas, tables, games, and staff. Most properties are operational within a single session.',
  },
  {
    question: 'Can I import data from my current system?',
    answer:
      'Yes. Player Tracker includes a supervised import tool for player data and historical ratings. Imported records are quarantined, classified by match confidence, and only applied after admin review.',
  },
  {
    question: 'What about pricing?',
    answer:
      'One product, one price per property. No tiers, no per-seat fees. Contact us to discuss pricing for your operation.',
  },
  {
    question: 'Do I need to talk to someone before I can use it?',
    answer:
      'We recommend a short walkthrough so we can understand your floor and make sure Player Tracker is a good fit. Self-serve setup is available if you prefer to get started on your own.',
  },
];

export function FAQSection() {
  return (
    <Section id="faq">
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
        Common questions.
      </h2>
      <Accordion type="single" collapsible className="mt-8 max-w-2xl">
        {faqs.map((faq, i) => (
          <AccordionItem key={i} value={`item-${i}`}>
            <AccordionTrigger className="text-left text-base">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-muted-foreground">{faq.answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}
