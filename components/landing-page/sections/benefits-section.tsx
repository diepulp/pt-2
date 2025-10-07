"use client";

import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { ArrowRight, CheckCircle } from "lucide-react";
import { motion, useInView } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";

const benefits = [
  "Increase player retention by up to 40%",
  "Grow player lifetime value by 35%",
  "Reduce operational costs by 25%",
  "Boost marketing ROI by targeting high-value players",
  "Enhance customer experience with personalized rewards",
  "Make data-driven decisions with comprehensive analytics",
];

export function BenefitsSection() {
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

  const imageVariants = {
    hidden: { scale: 0.9, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: { duration: 0.7 },
    },
  };

  return (
    <section id="benefits" className="py-24 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-muted/30 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-muted/10 to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={containerVariants}
          className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
        >
          {/* Image Column */}
          <motion.div className="relative" variants={imageVariants}>
            <div className="relative aspect-square max-w-lg mx-auto lg:mx-0">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/10 via-secondary/10 to-success/10 blur-3xl" />
              <Card className="relative h-full w-full" radius="lg" shadow="lg">
                <CardBody className="p-0 relative overflow-hidden">
                  <Image
                    src="https://images.pexels.com/photos/8111311/pexels-photo-8111311.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
                    alt="Casino Player Benefits"
                    fill
                    loading="lazy"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-background/20" />

                  {/* Floating stats cards */}
                  <Card
                    className="absolute top-4 right-4 backdrop-blur-md bg-background/80"
                    shadow="md"
                    radius="lg"
                  >
                    <CardBody className="p-3">
                      <div className="flex flex-col items-center gap-1">
                        <Chip color="success" variant="flat" size="sm">
                          Player Retention
                        </Chip>
                        <p className="text-2xl font-bold text-success">+40%</p>
                      </div>
                    </CardBody>
                  </Card>

                  <Card
                    className="absolute bottom-4 left-4 backdrop-blur-md bg-background/80"
                    shadow="md"
                    radius="lg"
                  >
                    <CardBody className="p-3">
                      <div className="flex flex-col items-center gap-1">
                        <Chip color="primary" variant="flat" size="sm">
                          Revenue Growth
                        </Chip>
                        <p className="text-2xl font-bold text-primary">+35%</p>
                      </div>
                    </CardBody>
                  </Card>
                </CardBody>
              </Card>
            </div>
          </motion.div>

          {/* Content Column */}
          <div className="space-y-8">
            <motion.div variants={itemVariants}>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Transforming Player Data Into Business Growth
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Our platform doesn't just collect data—it transforms it into
                actionable insights that drive measurable business results.
              </p>
            </motion.div>

            <motion.div className="space-y-4" variants={containerVariants}>
              {benefits.map((benefit, index) => (
                <motion.div
                  key={index}
                  className="flex items-start gap-3"
                  variants={itemVariants}
                >
                  <CheckCircle className="h-6 w-6 text-success mt-0.5 shrink-0" />
                  <p className="text-foreground">{benefit}</p>
                </motion.div>
              ))}
            </motion.div>

            <motion.div variants={itemVariants}>
              <Button
                as={Link}
                href="#contact"
                size="lg"
                color="primary"
                className="group"
                endContent={
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                }
              >
                See How It Works
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
