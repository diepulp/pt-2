'use client'

import { Button } from '@heroui/button'
import { MailIcon, MapPinIcon, PhoneIcon, SendIcon } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@heroui/card'
import { Input, Textarea } from '@heroui/input'
import { Select, SelectItem } from '@heroui/select'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, useInView } from 'motion/react'

import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useToast } from '@/hooks/ui'

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  email: z.string().email('Please enter a valid email address.'),
  companyName: z.string().min(2, 'Company name must be at least 2 characters.'),
  casinoSize: z.string().min(1, 'Please select your casino size.'),
  message: z.string().min(10, 'Message must be at least 10 characters.'),
})

export function ContactSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.2 })
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    companyName: '',
    casinoSize: '',
    message: '',
  })
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validateForm = () => {
    try {
      formSchema.parse(formData)
      setErrors({})
      return true
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: { [key: string]: string } = {}
        error.issues.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message
          }
        })
        setErrors(newErrors)
      }
      return false
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      toast({
        title: 'Demo Request Received',
        description:
          'Thank you for your interest. Our team will contact you shortly.',
      })

      setFormData({
        name: '',
        email: '',
        companyName: '',
        casinoSize: '',
        message: '',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }))
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.5 },
    },
  }

  return (
    <section id="contact" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={containerVariants}
          className="max-w-6xl mx-auto"
        >
          <motion.div
            className="grid grid-cols-1 lg:grid-cols-2 gap-12"
            variants={containerVariants}
          >
            {/* Contact Info */}
            <motion.div variants={itemVariants}>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Request a Demo
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Experience the power of CasinoTrack Pro firsthand. Fill out the
                form and our team will reach out to schedule a personalized
                demo.
              </p>

              <div className="mt-12 space-y-4">
                <Card className="p-4" shadow="sm" radius="lg" isHoverable>
                  <CardBody className="p-0">
                    <div className="flex items-center gap-4">
                      <div className="bg-secondary/20 p-3 rounded-full">
                        <MailIcon className="h-6 w-6 text-secondary" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          Email Us
                        </h3>
                        <p className="text-foreground/70 mt-1">
                          demo@casinotrackpro.com
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                <Card className="p-4" shadow="sm" radius="lg" isHoverable>
                  <CardBody className="p-0">
                    <div className="flex items-center gap-4">
                      <div className="bg-warning/20 p-3 rounded-full">
                        <PhoneIcon className="h-6 w-6 text-warning" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          Call Us
                        </h3>
                        <p className="text-foreground/70 mt-1">
                          +1 (888) 555-0123
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                <Card className="p-4" shadow="sm" radius="lg" isHoverable>
                  <CardBody className="p-0">
                    <div className="flex items-center gap-4">
                      <div className="bg-primary/20 p-3 rounded-full">
                        <MapPinIcon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          Visit Us
                        </h3>
                        <p className="text-foreground/70 mt-1">
                          8888 Casino Boulevard
                          <br />
                          Las Vegas, NV 89109
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </div>
            </motion.div>

            {/* Contact Form */}
            <motion.div variants={itemVariants}>
              <Card className="p-8" shadow="lg" radius="lg">
                <CardHeader className="pb-6">
                  <h3 className="text-2xl font-bold text-foreground">
                    Get Started Today
                  </h3>
                  <p className="text-foreground/70">
                    Fill out the form below and we'll get back to you within 24
                    hours.
                  </p>
                </CardHeader>
                <CardBody className="pt-0">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <Input
                      label="Full Name"
                      placeholder="John Smith"
                      value={formData.name}
                      onValueChange={(value) =>
                        handleInputChange('name', value)
                      }
                      isInvalid={!!errors.name}
                      errorMessage={errors.name}
                      variant="bordered"
                      size="lg"
                      isRequired
                    />

                    <Input
                      label="Email Address"
                      placeholder="john@company.com"
                      type="email"
                      value={formData.email}
                      onValueChange={(value) =>
                        handleInputChange('email', value)
                      }
                      isInvalid={!!errors.email}
                      errorMessage={errors.email}
                      variant="bordered"
                      size="lg"
                      isRequired
                    />

                    <Input
                      label="Casino/Company Name"
                      placeholder="Grand Palace Casino"
                      value={formData.companyName}
                      onValueChange={(value) =>
                        handleInputChange('companyName', value)
                      }
                      isInvalid={!!errors.companyName}
                      errorMessage={errors.companyName}
                      variant="bordered"
                      size="lg"
                      isRequired
                    />

                    <Select
                      label="Casino Size"
                      placeholder="Select your casino size"
                      selectedKeys={
                        formData.casinoSize ? [formData.casinoSize] : []
                      }
                      onSelectionChange={(keys) => {
                        const value = Array.from(keys)[0] as string
                        handleInputChange('casinoSize', value || '')
                      }}
                      isInvalid={!!errors.casinoSize}
                      errorMessage={errors.casinoSize}
                      variant="bordered"
                      size="lg"
                      isRequired
                    >
                      <SelectItem key="small">
                        Small (up to 20 tables)
                      </SelectItem>
                      <SelectItem key="medium">
                        Medium (20-50 tables)
                      </SelectItem>
                      <SelectItem key="large">Large (50+ tables)</SelectItem>
                      <SelectItem key="resort">Casino Resort</SelectItem>
                    </Select>

                    <Textarea
                      label="Message"
                      placeholder="Tell us about your specific needs and questions..."
                      value={formData.message}
                      onValueChange={(value: string) =>
                        handleInputChange('message', value)
                      }
                      isInvalid={!!errors.message}
                      errorMessage={errors.message}
                      variant="bordered"
                      minRows={4}
                      size="lg"
                      isRequired
                    />

                    <Button
                      type="submit"
                      color="primary"
                      size="lg"
                      className="w-full group"
                      isLoading={isSubmitting}
                      endContent={
                        !isSubmitting && (
                          <SendIcon className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        )
                      }
                    >
                      {isSubmitting ? 'Sending...' : 'Request Demo'}
                    </Button>
                  </form>
                </CardBody>
              </Card>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
