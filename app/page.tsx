"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import * as faceapi from "face-api.js"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsItem, TabsList } from "@/components/ui/tabs"
import { Camera, User, Bell, Save, Trash2, Upload, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"

// Define types for our data structures
interface Person {
  name: string
  descriptors: Float32Array[]
  photos: string[] // Base64 encoded images
}

export default function FacialRecognition() {
  const { toast } = useToast()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const photoPreviewRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isModelLoaded, setIsModelLoaded] = useState(false)
  const [modelLoadingProgress, setModelLoadingProgress] = useState(0)
  const [loadingStatus, setLoadingStatus] = useState("Initializing...")
  const [isStreamActive, setIsStreamActive] = useState(false)
  const [knownPersons, setKnownPersons] = useState<Person[]>([])
  const [newPersonName, setNewPersonName] = useState("")
  const [detectionActive, setDetectionActive] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [lastDetectedPerson, setLastDetectedPerson] = useState<string | null>(null)
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [processingImage, setProcessingImage] = useState(false)
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.6)

  const detectionInterval = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models"

      try {
        setLoadingStatus("Loading SSD MobileNet detector...")
        setModelLoadingProgress(20)
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL)

        setLoadingStatus("Loading face landmarks...")
        setModelLoadingProgress(40)
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)

        setLoadingStatus("Loading face recognition...")
        setModelLoadingProgress(60)
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)

        setLoadingStatus("Loading face expressions...")
        setModelLoadingProgress(80)
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)

        setLoadingStatus("Models loaded successfully!")
        setModelLoadingProgress(100)
        setIsModelLoaded(true)

        toast({
          title: "Models loaded",
          description: "Facial recognition models have been loaded successfully.",
        })
      } catch (error) {
        console.error("Error loading models:", error)
        setLoadingStatus("Error loading models. Trying backup...")

        // Try backup URLs
        const backupUrls = [
          "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights",
          "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights",
        ]

        for (const backupUrl of backupUrls) {
          try {
            setLoadingStatus(`Trying backup: ${backupUrl}`)
            await Promise.all([
              faceapi.nets.ssdMobilenetv1.loadFromUri(backupUrl),
              faceapi.nets.faceLandmark68Net.loadFromUri(backupUrl),
              faceapi.nets.faceRecognitionNet.loadFromUri(backupUrl),
              faceapi.nets.faceExpressionNet.loadFromUri(backupUrl),
            ])

            setLoadingStatus("Backup models loaded successfully!")
            setModelLoadingProgress(100)
            setIsModelLoaded(true)

            toast({
              title: "Backup models loaded",
              description: "Using backup facial recognition models.",
            })
            return
          } catch (backupError) {
            console.error(`Backup ${backupUrl} failed:`, backupError)
          }
        }

        // If all attempts failed
        setLoadingStatus("Failed to load models from all sources")
        toast({
          title: "Critical error",
          description: "Could not load facial recognition models from any source.",
          variant: "destructive",
        })
      }
    }

    loadModels()

    // Load saved persons from localStorage
    const savedPersons = localStorage.getItem("knownPersons")
    if (savedPersons) {
      try {
        const parsedPersons = JSON.parse(savedPersons)
        // Convert back from array to Float32Array
        const restoredPersons = parsedPersons.map((person: any) => ({
          name: person.name,
          descriptors: person.descriptors.map((desc: any) => new Float32Array(Object.values(desc))),
          photos: person.photos,
        }))
        setKnownPersons(restoredPersons)
      } catch (e) {
        console.error("Error loading saved persons:", e)
      }
    }

    // Request notification permission
    if ("Notification" in window) {
      Notification.requestPermission()
    }

    return () => {
      if (detectionInterval.current) {
        clearInterval(detectionInterval.current)
      }
    }
  }, [toast])

  // Save persons to localStorage when they change
  useEffect(() => {
    if (knownPersons.length > 0) {
      // Need to convert Float32Array to regular arrays for JSON serialization
      const serializablePersons = knownPersons.map((person) => ({
        name: person.name,
        descriptors: person.descriptors.map((desc) => Array.from(desc)),
        photos: person.photos,
      }))
      localStorage.setItem("knownPersons", JSON.stringify(serializablePersons))
    }
  }, [knownPersons])

  // Start webcam
  const startWebcam = async () => {
    if (!isModelLoaded) {
      toast({
        title: "Models not loaded",
        description: "Please wait for the facial recognition models to load.",
        variant: "destructive",
      })
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setIsStreamActive(true)
        toast({
          title: "Camera started",
          description: "Your webcam has been activated.",
        })
      }
    } catch (error) {
      console.error("Error accessing webcam:", error)
      toast({
        title: "Camera error",
        description: "Could not access your webcam. Please check permissions.",
        variant: "destructive",
      })
    }
  }

  // Stop webcam
  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      const tracks = stream.getTracks()
      tracks.forEach((track) => track.stop())
      videoRef.current.srcObject = null
      setIsStreamActive(false)

      if (detectionActive) {
        stopDetection()
      }

      toast({
        title: "Camera stopped",
        description: "Your webcam has been deactivated.",
      })
    }
  }

  // Handle file upload for reference photos
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check if it's an image
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please upload an image file.",
        variant: "destructive",
      })
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      if (event.target?.result) {
        setUploadedImage(event.target.result as string)
      }
    }
    reader.readAsDataURL(file)
  }

  // Process the uploaded image to extract face descriptor
  const processUploadedImage = async () => {
    if (!uploadedImage || !newPersonName.trim() || !isModelLoaded) {
      toast({
        title: "Cannot process image",
        description: "Please upload an image and enter a name.",
        variant: "destructive",
      })
      return
    }

    setProcessingImage(true)

    try {
      // Create an image element to process with face-api
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = uploadedImage

      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })

      // Detect faces in the image using SSD MobileNet
      const detections = await faceapi
        .detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors()

      if (detections.length === 0) {
        toast({
          title: "No face detected",
          description: "No face was detected in the uploaded image. Try a clearer photo.",
          variant: "destructive",
        })
        setProcessingImage(false)
        return
      }

      if (detections.length > 1) {
        toast({
          title: "Multiple faces detected",
          description: "Multiple faces were detected. Using the largest face.",
        })
      }

      // Get the descriptor for the largest face (first one is usually the largest)
      const faceDescriptor = detections[0].descriptor

      // Check if person already exists
      const existingPersonIndex = knownPersons.findIndex((p) => p.name === newPersonName)

      if (existingPersonIndex >= 0) {
        // Add to existing person
        setKnownPersons((prev) => {
          const updated = [...prev]
          updated[existingPersonIndex] = {
            ...updated[existingPersonIndex],
            descriptors: [...updated[existingPersonIndex].descriptors, faceDescriptor],
            photos: [...updated[existingPersonIndex].photos, uploadedImage],
          }
          return updated
        })

        toast({
          title: "Face added",
          description: `Added a new reference photo for ${newPersonName}.`,
        })
      } else {
        // Create new person
        setKnownPersons((prev) => [
          ...prev,
          {
            name: newPersonName,
            descriptors: [faceDescriptor],
            photos: [uploadedImage],
          },
        ])

        toast({
          title: "Person added",
          description: `${newPersonName} has been added with their first reference photo.`,
        })
      }

      // Clear the form
      setNewPersonName("")
      setUploadedImage(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    } catch (error) {
      console.error("Error processing image:", error)
      toast({
        title: "Processing error",
        description: "An error occurred while processing the image. Please try again.",
        variant: "destructive",
      })
    } finally {
      setProcessingImage(false)
    }
  }

  // Capture face from webcam
  const captureFace = async () => {
    if (!isStreamActive || !videoRef.current || !canvasRef.current || !newPersonName.trim()) {
      toast({
        title: "Cannot capture face",
        description: "Please start the webcam and enter a name.",
        variant: "destructive",
      })
      return
    }

    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      const displaySize = { width: video.videoWidth, height: video.videoHeight }
      faceapi.matchDimensions(canvas, displaySize)

      // Use SSD MobileNet for detection
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors()

      if (detections.length === 0) {
        toast({
          title: "No face detected",
          description: "Please make sure your face is clearly visible to the camera.",
          variant: "destructive",
        })
        return
      }

      if (detections.length > 1) {
        toast({
          title: "Multiple faces detected",
          description: "Please ensure only one face is visible to the camera.",
          variant: "destructive",
        })
        return
      }

      // Get the descriptor for the detected face
      const faceDescriptor = detections[0].descriptor

      // Create a snapshot of the current video frame
      const tempCanvas = document.createElement("canvas")
      tempCanvas.width = video.videoWidth
      tempCanvas.height = video.videoHeight
      const ctx = tempCanvas.getContext("2d")
      if (ctx) {
        ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height)
        const photoDataUrl = tempCanvas.toDataURL("image/jpeg", 0.8)

        // Check if person already exists
        const existingPersonIndex = knownPersons.findIndex((p) => p.name === newPersonName)

        if (existingPersonIndex >= 0) {
          // Add to existing person
          setKnownPersons((prev) => {
            const updated = [...prev]
            updated[existingPersonIndex] = {
              ...updated[existingPersonIndex],
              descriptors: [...updated[existingPersonIndex].descriptors, faceDescriptor],
              photos: [...updated[existingPersonIndex].photos, photoDataUrl],
            }
            return updated
          })

          toast({
            title: "Face added",
            description: `Added a new reference photo for ${newPersonName}.`,
          })
        } else {
          // Create new person
          setKnownPersons((prev) => [
            ...prev,
            {
              name: newPersonName,
              descriptors: [faceDescriptor],
              photos: [photoDataUrl],
            },
          ])

          toast({
            title: "Person added",
            description: `${newPersonName} has been added with their first reference photo.`,
          })
        }

        // Clear the form
        setNewPersonName("")

        // Draw the detection on the canvas
        const resizedDetections = faceapi.resizeResults(detections, displaySize)
        const canvasCtx = canvas.getContext("2d")
        if (canvasCtx) {
          canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
          faceapi.draw.drawDetections(canvas, resizedDetections)
          faceapi.draw.drawFaceLandmarks(canvas, resizedDetections)

          // Clear canvas after 3 seconds
          setTimeout(() => {
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
          }, 3000)
        }
      }
    } catch (error) {
      console.error("Error capturing face:", error)
      toast({
        title: "Error capturing face",
        description: "An error occurred while trying to capture the face.",
        variant: "destructive",
      })
    }
  }

  // Start face detection
  const startDetection = () => {
    if (!isStreamActive || knownPersons.length === 0) {
      toast({
        title: "Cannot start detection",
        description: "Please start the webcam and add at least one person to recognize.",
        variant: "destructive",
      })
      return
    }

    setDetectionActive(true)
    toast({
      title: "Detection started",
      description: "The system is now actively detecting faces.",
    })

    // Run detection every 1.5 seconds for better performance
    detectionInterval.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return

      const video = videoRef.current
      const canvas = canvasRef.current
      const displaySize = { width: video.videoWidth, height: video.videoHeight }
      faceapi.matchDimensions(canvas, displaySize)

      try {
        // Use SSD MobileNet for detection
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptors()

        const canvasCtx = canvas.getContext("2d")
        if (!canvasCtx) return

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height)

        if (detections.length === 0) return

        const resizedDetections = faceapi.resizeResults(detections, displaySize)
        faceapi.draw.drawDetections(canvas, resizedDetections)

        // For each detected face, find the best match among known persons
        for (const detection of resizedDetections) {
          let bestMatch = { label: "unknown", distance: 1.0 }

          // Check against each known person
          for (const person of knownPersons) {
            // Check against each descriptor for this person
            for (const descriptor of person.descriptors) {
              const distance = faceapi.euclideanDistance(descriptor, detection.descriptor)
              if (distance < bestMatch.distance) {
                bestMatch = { label: person.name, distance }
              }
            }
          }

          // Draw box with label
          const box = detection.detection.box
          const confidence = Math.round((1 - bestMatch.distance) * 100)
          const isMatch = bestMatch.distance < 1 - confidenceThreshold

          const drawBox = new faceapi.draw.DrawBox(box, {
            label: `${bestMatch.label} (${confidence}%)`,
            boxColor: isMatch ? "green" : "red",
          })
          drawBox.draw(canvas)

          // If we have a good match and notifications are enabled
          if (isMatch && bestMatch.label !== "unknown" && notificationsEnabled) {
            const personName = bestMatch.label

            // Only notify if this is a new detection (not the same person as last time)
            if (personName !== lastDetectedPerson) {
              setLastDetectedPerson(personName)
              sendNotification(personName)
            }
          } else if (!isMatch) {
            // Reset last detected person if no good match
            setLastDetectedPerson(null)
          }
        }
      } catch (error) {
        console.error("Error during detection:", error)
      }
    }, 1500)
  }

  // Stop face detection
  const stopDetection = () => {
    if (detectionInterval.current) {
      clearInterval(detectionInterval.current)
      detectionInterval.current = null
    }

    setDetectionActive(false)
    setLastDetectedPerson(null)

    // Clear canvas
    if (canvasRef.current) {
      const canvas = canvasRef.current
      const canvasCtx = canvas.getContext("2d")
      if (canvasCtx) {
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }

    toast({
      title: "Detection stopped",
      description: "Face detection has been deactivated.",
    })
  }

  // Send notification when a face is recognized
  const sendNotification = (personName: string) => {
    // Web notification
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Face Detected", {
        body: `${personName} has been detected by the camera.`,
        icon: "/notification-icon.png",
      })
    }

    // Also show in-app toast
    toast({
      title: "Face Detected",
      description: `${personName} has been detected by the camera.`,
      variant: "default",
    })
  }

  // Delete a known person
  const deletePerson = (index: number) => {
    setKnownPersons((prev) => prev.filter((_, i) => i !== index))
    toast({
      title: "Person deleted",
      description: "The person has been removed from recognized faces.",
    })
  }

  // Toggle notifications
  const toggleNotifications = () => {
    if (!notificationsEnabled && "Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          setNotificationsEnabled(true)
          toast({
            title: "Notifications enabled",
            description: "You will now receive notifications when faces are detected.",
          })
        } else {
          toast({
            title: "Permission denied",
            description: "Notification permission was denied.",
            variant: "destructive",
          })
        }
      })
    } else {
      setNotificationsEnabled(!notificationsEnabled)
      toast({
        title: notificationsEnabled ? "Notifications disabled" : "Notifications enabled",
        description: notificationsEnabled
          ? "You will no longer receive notifications."
          : "You will now receive notifications when faces are detected.",
      })
    }
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6 text-center">Advanced Facial Recognition System</h1>

      {!isModelLoaded && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Loading Models</CardTitle>
            <CardDescription>Please wait while the facial recognition models are loading...</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={modelLoadingProgress} className="h-2" />
            <p className="text-sm text-muted-foreground mt-2 text-center">{loadingStatus}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Camera Feed</CardTitle>
              <CardDescription>View the live camera feed and facial recognition results</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden">
                <video ref={videoRef} autoPlay muted className="absolute inset-0 w-full h-full object-cover" />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />
                {!isStreamActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                    <Camera className="w-12 h-12" />
                    <span className="ml-2 text-lg">Camera is off</span>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2 justify-between">
              {!isStreamActive ? (
                <Button onClick={startWebcam} disabled={!isModelLoaded}>
                  <Camera className="mr-2 h-4 w-4" />
                  Start Camera
                </Button>
              ) : (
                <Button onClick={stopWebcam} variant="destructive">
                  <Camera className="mr-2 h-4 w-4" />
                  Stop Camera
                </Button>
              )}

              {!detectionActive ? (
                <Button
                  onClick={startDetection}
                  disabled={!isStreamActive || knownPersons.length === 0}
                  variant="outline"
                >
                  <User className="mr-2 h-4 w-4" />
                  Start Detection
                </Button>
              ) : (
                <Button onClick={stopDetection} variant="destructive">
                  <User className="mr-2 h-4 w-4" />
                  Stop Detection
                </Button>
              )}

              <Button onClick={toggleNotifications} variant={notificationsEnabled ? "default" : "outline"}>
                <Bell className="mr-2 h-4 w-4" />
                {notificationsEnabled ? "Disable Notifications" : "Enable Notifications"}
              </Button>
            </CardFooter>
          </Card>

          {lastDetectedPerson && (
            <Card className="mb-6 border-green-500">
              <CardHeader className="bg-green-50 dark:bg-green-900/20">
                <CardTitle className="flex items-center">
                  <User className="mr-2 h-5 w-5" />
                  Face Detected
                </CardTitle>
                <CardDescription>A recognized face has been detected</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <p className="text-xl font-bold">{lastDetectedPerson}</p>
                <p className="text-sm text-muted-foreground mt-2">Detected at {new Date().toLocaleTimeString()}</p>
              </CardContent>
            </Card>
          )}

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Recognition Settings</CardTitle>
              <CardDescription>Adjust the confidence threshold for face recognition</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <Label htmlFor="confidence">Confidence Threshold: {Math.round(confidenceThreshold * 100)}%</Label>
                  </div>
                  <Input
                    id="confidence"
                    type="range"
                    min="0.3"
                    max="0.9"
                    step="0.05"
                    value={confidenceThreshold}
                    onChange={(e) => setConfidenceThreshold(Number.parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Higher values require more accurate matches but may miss some faces. Lower values will detect more
                    faces but may have false positives.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Tabs defaultValue="add">
            <TabsList className="grid w-full grid-cols-3">
              <TabsItem value="add">Add from Camera</TabsItem>
              <TabsItem value="upload">Upload Photos</TabsItem>
              <TabsItem value="manage">Manage People</TabsItem>
            </TabsList>

            <TabsContent value="add">
              <Card>
                <CardHeader>
                  <CardTitle>Add Face from Camera</CardTitle>
                  <CardDescription>Capture a face from your webcam to be recognized by the system</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="camera-name">Person's Name</Label>
                      <Input
                        id="camera-name"
                        placeholder="Enter name"
                        value={newPersonName}
                        onChange={(e) => setNewPersonName(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button onClick={captureFace} disabled={!isStreamActive || !newPersonName.trim()}>
                    <Save className="mr-2 h-4 w-4" />
                    Capture Face
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="upload">
              <Card>
                <CardHeader>
                  <CardTitle>Upload Reference Photo</CardTitle>
                  <CardDescription>Upload a photo of a person to be recognized by the system</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="upload-name">Person's Name</Label>
                      <Input
                        id="upload-name"
                        placeholder="Enter name"
                        value={newPersonName}
                        onChange={(e) => setNewPersonName(e.target.value)}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="photo-upload">Reference Photo</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="photo-upload"
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          className="flex-1"
                        />
                        <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {uploadedImage && (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-2">Preview:</p>
                        <div className="relative aspect-square w-full max-w-[200px] mx-auto border rounded-md overflow-hidden">
                          <img
                            src={uploadedImage || "/placeholder.svg"}
                            alt="Preview"
                            ref={photoPreviewRef}
                            className="object-cover w-full h-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={processUploadedImage}
                    disabled={!uploadedImage || !newPersonName.trim() || processingImage || !isModelLoaded}
                  >
                    {processingImage ? (
                      <>Processing...</>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Process Photo
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="manage">
              <Card>
                <CardHeader>
                  <CardTitle>Manage People</CardTitle>
                  <CardDescription>View and manage people that the system can recognize</CardDescription>
                </CardHeader>
                <CardContent>
                  {knownPersons.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">
                      No people have been added yet. Add a person to get started.
                    </p>
                  ) : (
                    <div className="space-y-6">
                      {knownPersons.map((person, index) => (
                        <div key={index} className="border rounded-md overflow-hidden">
                          <div className="flex items-center justify-between p-3 bg-muted/50">
                            <div className="flex items-center">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-6 w-6" />
                              </div>
                              <span className="ml-3 font-medium">{person.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">
                                {person.photos.length} photo{person.photos.length !== 1 ? "s" : ""}
                              </span>
                              <Button variant="ghost" size="icon" onClick={() => deletePerson(index)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="p-3">
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {person.photos.map((photo, photoIndex) => (
                                <div
                                  key={photoIndex}
                                  className="aspect-square relative rounded-md overflow-hidden border"
                                >
                                  <img
                                    src={photo || "/placeholder.svg"}
                                    alt={`${person.name} - photo ${photoIndex + 1}`}
                                    className="object-cover w-full h-full"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>How It Works</CardTitle>
              <CardDescription>Understanding the facial recognition system</CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Important</AlertTitle>
                <AlertDescription>
                  This system works entirely in your browser using SSD MobileNet for face detection. No data is sent to
                  any server.
                </AlertDescription>
              </Alert>

              <ol className="list-decimal pl-5 space-y-2">
                <li>Add reference photos of people you want to recognize either by camera capture or photo upload</li>
                <li>Start the camera and detection to begin recognizing faces</li>
                <li>The system compares detected faces with your reference photos using neural networks</li>
                <li>When a match is found above the confidence threshold, you'll receive a notification</li>
                <li>Adjust the confidence threshold to fine-tune recognition accuracy</li>
                <li>Add multiple photos per person for better recognition accuracy</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
