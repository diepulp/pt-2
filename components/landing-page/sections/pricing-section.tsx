"use client";

import { Button } from "@heroui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { CheckCircle, ChevronRight } from "lucide-react";
import { motion, useInView } from "motion/react";
import Link from "next/link";
import { useRef } from "react";

const plans = [
  {
    name: "Starter",
    price: "$1,999",
    description:
      "Perfect for small casinos getting started with player tracking",
    period: "per month",
    features: [
      "Player tracking for up to 5,000 players",
      "Basic rewards management",
      "Standard analytics dashboard",
      "Email support",
      "Data export capabilities",
    ],
    highlighted: false,
    buttonText: "Get Started",
  },
  {
    name: "Professional",
    price: "$3,999",
    description: "Comprehensive solution for medium-sized operations",
    period: "per month",
    features: [
      "Player tracking for up to 25,000 players",
      "Advanced rewards management",
      "Comprehensive analytics dashboard",
      "Email campaigns",
      "24/7 priority support",
      "API access for integrations",
      "Event management tools",
    ],
    highlighted: true,
    buttonText: "Most Popular",
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "Tailored solutions for large casino operations",
    period: "contact for pricing",
    features: [
      "Unlimited player tracking",
      "Custom rewards programs",
      "Advanced predictive analytics",
      "Full marketing suite",
      "Dedicated account manager",
      "Custom integrations",
      "On-site training and support",
      "High availability infrastructure",
    ],
    highlighted: false,
    buttonText: "Contact Sales",
  },
];

export function PricingSection() {
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
    <section id="pricing" className="py-24">
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
              Flexible Pricing for Casinos of All Sizes
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Choose the plan that best fits your operation's needs and scale as
              you grow.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            variants={containerVariants}
          >
            {plans.map((plan, index) => (
              <motion.div key={index} variants={itemVariants}>
                <Card
                  className={`h-full ${plan.highlighted ? "border-2 border-primary" : ""}`}
                  shadow={plan.highlighted ? "lg" : "md"}
                  radius="lg"
                  classNames={{
                    base: plan.highlighted
                      ? "bg-gradient-to-br from-primary/5 to-secondary/5"
                      : "",
                  }}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-2xl font-bold text-foreground">
                        {plan.name}
                      </h3>
                      {plan.highlighted && (
                        <Chip color="primary" variant="solid" size="sm">
                          Most Popular
                        </Chip>
                      )}
                    </div>
                    <div className="mt-4">
                      <span className="text-4xl font-bold text-foreground">
                        {plan.price}
                      </span>
                      <span className="text-foreground/60 ml-2 text-sm">
                        {plan.period}
                      </span>
                    </div>
                    <p className="text-foreground/70 mt-2">
                      {plan.description}
                    </p>
                  </CardHeader>
                  <Divider />
                  <CardBody className="py-4">
                    <ul className="space-y-3">
                      {plan.features.map((feature, featureIndex) => (
                        <li
                          key={featureIndex}
                          className="flex items-start gap-3"
                        >
                          <CheckCircle className="h-5 w-5 text-success mt-0.5 shrink-0" />
                          <span className="text-foreground/80">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                  <CardFooter className="pt-4">
                    <Button
                      as={Link}
                      href="#contact"
                      color={plan.highlighted ? "primary" : "default"}
                      variant={plan.highlighted ? "solid" : "flat"}
                      className="w-full group"
                      size="lg"
                      endContent={
                        <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      }
                    >
                      {plan.buttonText}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <motion.div className="text-center mt-16" variants={itemVariants}>
            <p className="text-muted-foreground">
              All plans include a 14-day free trial. No credit card required.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
