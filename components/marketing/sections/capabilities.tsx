import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const capabilities = [
  {
    title: 'Player 360',
    description: 'Value snapshot, visit history, reward history — one screen.',
  },
  {
    title: 'Shift dashboards',
    description: 'Running totals and operational visibility for the floor.',
  },
  {
    title: 'Rewards history',
    description: 'Timeline and issuance rules.',
  },
  {
    title: 'Visits & sessions',
    description: 'Who is in, who was in, and what happened.',
  },
  {
    title: 'Operational logs',
    description: 'Table events, rotations, and handover notes.',
  },
  {
    title: 'Role-based access',
    description: 'Staff roles and tenant scoping. No shared logins.',
  },
];

export function CapabilitiesSection() {
  return (
    <section id="capabilities" className="py-16 md:py-20 lg:py-24">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl md:text-4xl font-semibold mb-10">
          What you get.
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {capabilities.map((cap) => (
            <Card key={cap.title}>
              <CardHeader>
                <CardTitle className="text-lg">{cap.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-base">
                  {cap.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
