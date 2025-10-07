"use client";

import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import {
  BarChart3,
  Calendar,
  Database,
  Mail,
  PieChart,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

const features = [
  {
    title: "Player Tracking",
    description:
      "Track every aspect of player behavior, from games played to time spent and betting patterns.",
    icon: Users,
    chipColor: "primary" as const,
    iconClass: "text-primary",
  },
  {
    title: "Rewards Management",
    description:
      "Create customizable rewards programs that automatically track points and distribute benefits.",
    icon: Trophy,
    chipColor: "secondary" as const,
    iconClass: "text-secondary",
  },
  {
    title: "Analytics Dashboard",
    description:
      "Visualize key performance metrics and player data with customizable real-time dashboards.",
    icon: BarChart3,
    chipColor: "success" as const,
    iconClass: "text-success",
  },
  {
    title: "Email Campaigns",
    description:
      "Design targeted email campaigns based on player behavior and preferences.",
    icon: Mail,
    chipColor: "warning" as const,
    iconClass: "text-warning",
  },
  {
    title: "Event Management",
    description:
      "Schedule and manage promotional events, tournaments, and special occasions.",
    icon: Calendar,
    chipColor: "danger" as const,
    iconClass: "text-danger",
  },
  {
    title: "Data Integration",
    description:
      "Seamless integration with existing casino management systems and third-party applications.",
    icon: Database,
    chipColor: "primary" as const,
    iconClass: "text-primary",
  },
  {
    title: "Predictive Analytics",
    description:
      "Leverage AI to predict player behavior and optimize marketing efforts.",
    icon: PieChart,
    chipColor: "secondary" as const,
    iconClass: "text-secondary",
  },
  {
    title: "Personalization Engine",
    description:
      "Create personalized experiences for each player based on their preferences and history.",
    icon: Sparkles,
    chipColor: "success" as const,
    iconClass: "text-success",
  },
];

export function FeaturesSection() {
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
    <section
      id="features"
      className="py-24 bg-gradient-to-b from-background to-default-50"
    >
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
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
              Comprehensive Features for Modern Casinos
            </h2>
            <p className="mt-4 text-lg text-foreground/70">
              Our platform offers everything you need to track, analyze, and
              enhance player experiences.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            variants={containerVariants}
          >
            {features.map((feature, index) => (
              <motion.div key={index} variants={itemVariants}>
                <Card
                  className="h-full hover:scale-105 transition-transform duration-300"
                  shadow="md"
                  isPressable
                  isHoverable
                >
                  <CardHeader className="pb-4">
                    <div className="flex flex-col gap-3">
                      <Chip
                        color={feature.chipColor}
                        variant="flat"
                        size="lg"
                        startContent={<feature.icon className="h-4 w-4" />}
                        className="w-fit"
                      >
                        {feature.title}
                      </Chip>
                    </div>
                  </CardHeader>
                  <CardBody className="pt-0">
                    <p className="text-foreground/80 text-sm leading-relaxed">
                      {feature.description}
                    </p>
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
