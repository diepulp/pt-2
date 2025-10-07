"use client";

import { Avatar } from "@heroui/avatar";
import { Card, CardBody, CardFooter, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Quote, Star } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

const testimonials = [
  {
    quote:
      "CasinoTrack Pro has revolutionized how we engage with our players. The data insights have helped us create targeted promotions that significantly increased player retention.",
    author: "Sarah Johnson",
    role: "Director of Player Relations",
    company: "Grand Palace Casino",
    rating: 5,
  },
  {
    quote:
      "The player tracking capabilities are unmatched. We've seen a 45% increase in player satisfaction and a 30% boost in loyalty program participation since implementing the system.",
    author: "Michael Chen",
    role: "VP of Operations",
    company: "Royal Diamond Resort",
    rating: 5,
  },
  {
    quote:
      "The ROI we've experienced with CasinoTrack Pro exceeded our expectations. The personalized marketing alone has paid for the entire system many times over.",
    author: "David Rodriguez",
    role: "Chief Marketing Officer",
    company: "Golden Sands Casino",
    rating: 5,
  },
  {
    quote:
      "Integration was seamless with our existing systems. The support team was outstanding throughout the entire process, and the results speak for themselves.",
    author: "Jennifer Williams",
    role: "IT Director",
    company: "Silver Star Entertainment",
    rating: 5,
  },
  {
    quote:
      "Our player retention has increased dramatically since implementing CasinoTrack Pro. The analytics tools give us insights we never had before.",
    author: "Robert Turner",
    role: "General Manager",
    company: "Emerald Coast Resort",
    rating: 5,
  },
];

export function TestimonialsSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.5 },
    },
  };

  return (
    <section id="testimonials" className="py-24 bg-muted/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={containerVariants}
          className="space-y-12"
        >
          <motion.div
            className="text-center max-w-3xl mx-auto"
            variants={itemVariants}
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Trusted by Leading Casinos Worldwide
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Hear what our customers have to say about their experience with
              CasinoTrack Pro.
            </p>
          </motion.div>

          <motion.div variants={itemVariants}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {testimonials.map((testimonial, index) => (
                <motion.div
                  key={index}
                  variants={itemVariants}
                  className="h-full"
                >
                  <Card className="h-full" shadow="md" radius="lg" isHoverable>
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <Quote className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-1">
                            {Array(testimonial.rating)
                              .fill(0)
                              .map((_, i) => (
                                <Star
                                  key={i}
                                  className="w-4 h-4 text-warning fill-current"
                                />
                              ))}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardBody className="py-0">
                      <p className="text-foreground/80 italic leading-relaxed">
                        "{testimonial.quote}"
                      </p>
                    </CardBody>
                    <CardFooter className="pt-4">
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={testimonial.author
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                          size="md"
                          classNames={{
                            base: "bg-gradient-to-br from-primary to-secondary",
                            name: "text-white font-semibold",
                          }}
                        />
                        <div className="flex flex-col">
                          <p className="font-semibold text-foreground">
                            {testimonial.author}
                          </p>
                          <p className="text-sm text-foreground/60">
                            {testimonial.role}
                          </p>
                          <Chip
                            color="default"
                            variant="flat"
                            size="sm"
                            className="mt-1"
                          >
                            {testimonial.company}
                          </Chip>
                        </div>
                      </div>
                    </CardFooter>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="flex flex-wrap justify-center gap-6 mt-16"
            variants={containerVariants}
          >
            {Array(5)
              .fill(0)
              .map((_, index) => (
                <motion.div key={index} variants={itemVariants}>
                  <Card
                    className="h-16 w-40"
                    shadow="sm"
                    radius="md"
                    isHoverable
                  >
                    <CardBody className="flex items-center justify-center">
                      <Chip
                        color="default"
                        variant="flat"
                        className="text-lg font-semibold"
                      >
                        Client {index + 1}
                      </Chip>
                    </CardBody>
                  </Card>
                </motion.div>
              ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
