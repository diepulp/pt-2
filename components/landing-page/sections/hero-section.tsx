'use client'

import { Avatar, AvatarGroup } from '@heroui/avatar'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { Button } from '@heroui/button'
import { Card, CardBody } from '@heroui/card'
import { motion } from 'motion/react'

import Image from 'next/image'
import Link from 'next/link'

export function HeroSection() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 0.1,
        staggerChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { y: 10, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.3, ease: 'easeOut' },
    },
  }

  const imageVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.4, delay: 0.2 },
    },
  }

  return (
    <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-conic-[in_hsl_longer_hue] from-transparent to-background/30 pointer-events-none" />

      {/* Animated dots background */}
      <div className="absolute inset-0 bg-[url('https://images.pexels.com/photos/7130555/pexels-photo-7130555.jpeg?auto=compress&cs=tinysrgb&w=1920')] bg-cover bg-center opacity-10" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Text Content */}
          <div className="max-w-2xl">
            <motion.div variants={itemVariants}>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                <span className="bg-clip-text text-transparent bg-linear-to-r from-cyan-500 to-blue-500 ">
                  Elevate Player Experiences
                </span>
                <br />
                Maximize Casino Revenue
              </h1>
            </motion.div>

            <motion.p
              className="mt-6 text-xl text-foreground/70 leading-relaxed"
              variants={itemVariants}
            >
              The most comprehensive player tracking and rewards management
              system designed for modern casinos. Transform data into actionable
              insights and build lasting player relationships.
            </motion.p>

            <motion.div
              className="mt-10 flex flex-col sm:flex-row gap-4"
              variants={itemVariants}
            >
              <Button
                as={Link}
                href="#contact"
                size="lg"
                color="danger"
                className="group font-semibold"
                endContent={
                  <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                }
              >
                Request Demo
              </Button>
              <Button
                as={Link}
                href="#features"
                size="lg"
                variant="bordered"
                className="group font-semibold"
                endContent={
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                }
              >
                Explore Features
              </Button>
            </motion.div>

            <motion.div
              className="mt-8 flex items-center space-x-4"
              variants={itemVariants}
            >
              <AvatarGroup isBordered max={3} total={100}>
                <Avatar
                  name="TD"
                  size="md"
                  classNames={{
                    base: 'bg-gradient-to-br from-orange-400 to-red-400',
                    name: 'text-white font-bold text-xs',
                  }}
                />
                <Avatar
                  name="MR"
                  size="md"
                  classNames={{
                    base: 'bg-gradient-to-br from-teal-400 to-cyan-400',
                    name: 'text-white font-bold text-xs',
                  }}
                />
                <Avatar
                  name="CV"
                  size="md"
                  classNames={{
                    base: 'bg-gradient-to-br from-blue-400 to-purple-400',
                    name: 'text-white font-bold text-xs',
                  }}
                />
              </AvatarGroup>
              <p className="text-sm text-foreground/70">
                Trusted by{' '}
                <span className="font-bold text-foreground">100+</span> casinos
                worldwide
              </p>
            </motion.div>
          </div>

          {/* Dashboard Preview */}
          <motion.div className="relative" variants={imageVariants}>
            <Card className="relative aspect-video overflow-hidden shadow-2xl border-none bg-gradient-to-tr from-blue-500/10 to-purple-500/10">
              <CardBody className="p-0 relative">
                <Image
                  src="https://images.pexels.com/photos/7130555/pexels-photo-7130555.jpeg?auto=compress&cs=tinysrgb&w=1920"
                  alt="Casino Player Tracking Dashboard"
                  fill
                  priority
                  className="object-cover object-center opacity-90"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent"></div>
                <div className="absolute top-0 left-0 right-0 p-6 z-10">
                  <h3 className="text-xl font-semibold text-foreground">
                    Real-time Player Analytics Dashboard
                  </h3>
                  <p className="text-sm text-foreground/60 mt-2">
                    Track player behavior, rewards, and engagement in real-time
                  </p>
                </div>
              </CardBody>
            </Card>

            {/* Floating feature highlights */}
            <Card className="absolute -top-6 -right-6 hidden md:block shadow-xl backdrop-blur-sm bg-background/80 border-none">
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-400/20 to-red-400/20 flex items-center justify-center">
                    <span className="text-orange-500 text-xl font-bold">↑</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Player Retention
                    </p>
                    <p className="text-xs text-foreground/60">
                      +27% this quarter
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="absolute -bottom-6 -left-6 hidden md:block shadow-xl backdrop-blur-sm bg-background/80 border-none">
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-teal-400/20 to-cyan-400/20 flex items-center justify-center">
                    <span className="text-teal-500 text-xl font-bold">$</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground bg-gradient-to-r from-primary to-primary/50 bg-clip-text ">
                      Revenue Increase
                    </p>
                    <p className="text-xs text-foreground/60">
                      +35% per player
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
