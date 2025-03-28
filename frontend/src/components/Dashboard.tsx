import {
    Accordion,
    AccordionItem,
    Alert,
    Button,
    Chip,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Radio,
    RadioGroup,
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableColumn,
    TableHeader,
    TableRow,
    getKeyValue,
    useDisclosure,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { formatDistanceToNow } from 'date-fns'
import { Upload } from 'lucide-react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useSelector } from 'react-redux'

import { PausedWorkflowResponse, ResumeActionRequest } from '@/types/api_types/pausedWorkflowSchemas'
import { RunResponse } from '@/types/api_types/runSchemas'
import {
    SpurType,
    WorkflowCreateRequest,
    WorkflowDefinition,
    WorkflowResponse,
} from '@/types/api_types/workflowSchemas'

import { RootState } from '../store/store'
import { Template } from '../types/workflow'
import {
    ApiKey,
    cancelWorkflow,
    createWorkflow,
    deleteWorkflow,
    duplicateWorkflow,
    getApiKey,
    getTemplates,
    getWorkflowRuns,
    getWorkflows,
    instantiateTemplate,
    listApiKeys,
    listPausedWorkflows,
    takePauseAction,
} from '../utils/api'
import TemplateCard from './cards/TemplateCard'
import SpurTypeChip from './chips/SpurTypeChip'
import HumanInputModal from './modals/HumanInputModal'
import WelcomeModal from './modals/WelcomeModal'

// Calendly Widget Component
const CalendlyWidget: React.FC = () => {
    useEffect(() => {
        // Check if script already exists
        const existingScript = document.querySelector(
            'script[src="https://assets.calendly.com/assets/external/widget.js"]'
        )
        let scriptElement: HTMLScriptElement | null = null

        if (!existingScript) {
            // Load Calendly widget script only if it doesn't exist
            scriptElement = document.createElement('script')
            scriptElement.src = 'https://assets.calendly.com/assets/external/widget.js'
            scriptElement.async = true
            document.body.appendChild(scriptElement)
        }

        const initializeWidget = () => {
            if ((window as any).Calendly) {
                ;(window as any).Calendly.initBadgeWidget({
                    url: 'https://calendly.com/d/cnf9-57m-bv3/pyspur-founders',
                    text: 'Talk to the founders',
                    color: '#1a1a1a',
                    textColor: '#ffffff',
                })
            }
        }

        // Initialize widget once script is loaded or if it already exists
        if (existingScript) {
            initializeWidget()
        } else if (scriptElement) {
            scriptElement.onload = initializeWidget
        }

        return () => {
            // Remove the widget element if it exists
            const widgetElements = document.querySelectorAll('.calendly-badge-widget')
            widgetElements.forEach((element) => element.remove())

            // Remove the inline widget if it exists
            const inlineWidgets = document.querySelectorAll('.calendly-inline-widget')
            inlineWidgets.forEach((element) => element.remove())

            // Remove any Calendly popups if they exist
            const popupWidgets = document.querySelectorAll('.calendly-overlay')
            popupWidgets.forEach((element) => element.remove())

            // Clean up the script only if we added it
            if (scriptElement && document.body.contains(scriptElement)) {
                document.body.removeChild(scriptElement)
            }

            // Reset the Calendly object
            if ((window as any).Calendly) {
                delete (window as any).Calendly
            }
        }
    }, [])

    return null
}

const Dashboard: React.FC = () => {
    const router = useRouter()
    const [workflows, setWorkflows] = useState<WorkflowResponse[]>([])
    const [templates, setTemplates] = useState<Template[]>([])
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
    const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(true)
    const [showWelcome, setShowWelcome] = useState(false)
    const hasSeenWelcome = useSelector((state: RootState) => state.userPreferences.hasSeenWelcome)
    const [workflowRuns, setWorkflowRuns] = useState<Record<string, RunResponse[]>>({})
    const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(true)
    const [highlightedWorkflowId, setHighlightedWorkflowId] = useState<string | null>(null)
    const [workflowPage, setWorkflowPage] = useState(1)
    const [hasMoreWorkflows, setHasMoreWorkflows] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [pausedWorkflows, setPausedWorkflows] = useState<PausedWorkflowResponse[]>([])
    const [selectedWorkflow, setSelectedWorkflow] = useState<PausedWorkflowResponse | null>(null)
    const [isHumanInputModalOpen, setIsHumanInputModalOpen] = useState(false)
    const [isLoadingPaused, setIsLoadingPaused] = useState(false)
    const [alertMessage, setAlertMessage] = useState<string | null>(null)
    const [alertColor, setAlertColor] = useState<'success' | 'danger' | 'warning' | 'default'>('default')
    const [showAlert, setShowAlert] = useState(false)
    const { isOpen: isNewSpurModalOpen, onOpen: onOpenNewSpurModal, onClose: onCloseNewSpurModal } = useDisclosure()
    const [selectedSpurType, setSelectedSpurType] = useState<SpurType>(SpurType.WORKFLOW)

    // Function to show alerts
    const onAlert = (message: string, color: 'success' | 'danger' | 'warning' | 'default' = 'default') => {
        setAlertMessage(message)
        setAlertColor(color)
        setShowAlert(true)

        // Auto-hide the alert after 5 seconds
        setTimeout(() => {
            setShowAlert(false)
        }, 5000)
    }

    useEffect(() => {
        const fetchWorkflows = async () => {
            setIsLoadingWorkflows(true)
            try {
                const workflows = await getWorkflows(1)
                const runsMap = await Promise.all(workflows.map((workflow) => fetchWorkflowRuns(workflow.id))).then(
                    (runs) => {
                        const map: Record<string, RunResponse[]> = {}
                        workflows.forEach((workflow, i) => {
                            map[workflow.id] = runs[i] || []
                        })
                        return map
                    }
                )
                // Sort workflows by updated_at in descending order (newest first)
                const sortedWorkflows = [...workflows].sort(
                    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                )
                setWorkflows(sortedWorkflows as WorkflowResponse[])
                setShowWelcome(!hasSeenWelcome && workflows.length === 0)
                setWorkflowRuns(runsMap)
                setHasMoreWorkflows(workflows.length === 10)
            } catch (error) {
                console.error('Error fetching workflows:', error)
            } finally {
                setIsLoadingWorkflows(false)
            }
        }

        fetchWorkflows()
    }, [hasSeenWelcome])

    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const templates = await getTemplates()
                setTemplates(templates)
            } catch (error) {
                console.error('Error fetching templates:', error)
            }
        }

        fetchTemplates()
    }, [])

    useEffect(() => {
        const fetchApiKeys = async () => {
            try {
                setIsLoadingApiKeys(true)
                const keys = await listApiKeys()
                const newApiKeys: ApiKey[] = []
                for (const key of keys) {
                    const value = await getApiKey(key)
                    newApiKeys.push({ name: key, value: value.value })
                }
                setApiKeys(newApiKeys)
            } catch (error) {
                console.error('Error fetching API keys:', error)
            } finally {
                setIsLoadingApiKeys(false)
            }
        }

        fetchApiKeys()
    }, [])

    useEffect(() => {
        const fetchPausedWorkflows = async () => {
            setIsLoadingPaused(true)
            try {
                const paused = await listPausedWorkflows()
                setPausedWorkflows(paused)
            } catch (error) {
                console.error('Error fetching paused workflows:', error)
            } finally {
                setIsLoadingPaused(false)
            }
        }

        fetchPausedWorkflows()
    }, [])

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const columns = [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'spur_type', label: 'Type' },
        { key: 'action', label: 'Action' },
        { key: 'recentRuns', label: 'Recent Runs' },
        { key: 'updated_at', label: 'Last Modified' },
    ]

    const fetchWorkflowRuns = async (workflowId: string) => {
        try {
            const runs = await getWorkflowRuns(workflowId)
            return runs.slice(0, 5)
        } catch (error) {
            console.error('Error fetching workflow runs:', error)
        }
    }

    const handleEditClick = (workflow: WorkflowResponse) => {
        router.push({
            pathname: `/workflows/${workflow.id}`,
        })
    }

    const handleNewWorkflowClick = async () => {
        onOpenNewSpurModal()
    }

    const handleCreateNewSpur = async () => {
        try {
            const uniqueName = `New ${selectedSpurType === SpurType.CHATBOT ? 'Chatbot' : 'Workflow'} ${new Date().toLocaleString()}`
            const newWorkflow: WorkflowCreateRequest = {
                name: uniqueName,
                description: '',
                definition: {
                    nodes: [],
                    links: [],
                    test_inputs: [],
                    spur_type: selectedSpurType,
                },
            }

            const createdWorkflow = await createWorkflow(newWorkflow)
            onCloseNewSpurModal()
            router.push(`/workflows/${createdWorkflow.id}`)
        } catch (error) {
            console.error('Error creating new workflow:', error)
            onAlert('Failed to create new spur', 'danger')
        }
    }

    const handleImportWorkflowClick = async () => {
        try {
            const fileInput = document.createElement('input')
            fileInput.type = 'file'
            fileInput.accept = 'application/json'

            fileInput.onchange = async (event: Event) => {
                const target = event.target as HTMLInputElement
                const file = target.files?.[0]
                if (!file) {
                    alert('No file selected. Please try again.')
                    return
                }

                const reader = new FileReader()
                reader.onload = async (e: ProgressEvent<FileReader>) => {
                    try {
                        const result = e.target?.result
                        if (typeof result !== 'string') return

                        const jsonContent: WorkflowCreateRequest = JSON.parse(result)
                        const uniqueName = `Imported Spur ${new Date().toLocaleString()}`

                        const newWorkflow: WorkflowCreateRequest = {
                            name: uniqueName,
                            description: jsonContent.description,
                            definition: jsonContent.definition as WorkflowDefinition,
                        }
                        const createdWorkflow = await createWorkflow(newWorkflow)
                        router.push(`/workflows/${createdWorkflow.id}`)
                    } catch (error) {
                        console.error('Error processing the JSON file:', error)
                        alert('Failed to import workflow. Please ensure the file is a valid JSON.')
                    }
                }
                reader.readAsText(file)
            }
            fileInput.click()
        } catch (error) {
            console.error('Error importing workflow:', error)
        }
    }

    const handleUseTemplate = async (template: Template) => {
        try {
            const newWorkflow = await instantiateTemplate(template)
            router.push(`/workflows/${newWorkflow.id}`)
        } catch (error) {
            console.error('Error using template:', error)
        }
    }

    const handleDeleteClick = async (workflow: WorkflowResponse) => {
        if (window.confirm(`Are you sure you want to delete workflow "${workflow.name}"?`)) {
            try {
                await deleteWorkflow(workflow.id)
                setWorkflows((prevWorkflows) => prevWorkflows.filter((w) => w.id !== workflow.id))
            } catch (error) {
                console.error('Error deleting workflow:', error)
                alert('Failed to delete workflow. Please try again.')
            }
        }
    }

    const handleDuplicateClick = async (workflow: WorkflowResponse) => {
        try {
            const duplicatedWorkflow = await duplicateWorkflow(workflow.id)
            setWorkflows((prevWorkflows) => [duplicatedWorkflow, ...prevWorkflows])
            setHighlightedWorkflowId(duplicatedWorkflow.id)
            setTimeout(() => {
                setHighlightedWorkflowId(null)
            }, 2000)
        } catch (error) {
            console.error('Error duplicating workflow:', error)
            alert('Failed to duplicate workflow. Please try again.')
        }
    }

    const handlePreviousRunClick = (runId: string) => {
        window.open(`/trace/${runId}`, '_blank')
    }

    const handleLoadMore = async () => {
        setIsLoadingMore(true)
        try {
            const nextPage = workflowPage + 1
            const moreWorkflows = await getWorkflows(nextPage)

            if (moreWorkflows.length > 0) {
                const runsMap = await Promise.all(moreWorkflows.map((workflow) => fetchWorkflowRuns(workflow.id))).then(
                    (runs) => {
                        const map: Record<string, RunResponse[]> = {}
                        moreWorkflows.forEach((workflow, i) => {
                            map[workflow.id] = runs[i] || []
                        })
                        return map
                    }
                )

                setWorkflows((prev) => {
                    // Merge previous and new workflows, then sort by updated_at
                    const combined = [...prev, ...moreWorkflows]
                    return combined.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                })
                setWorkflowRuns((prev) => ({ ...prev, ...runsMap }))
                setWorkflowPage(nextPage)
                setHasMoreWorkflows(moreWorkflows.length === 10)
            } else {
                setHasMoreWorkflows(false)
            }
        } catch (error) {
            console.error('Error loading more workflows:', error)
        } finally {
            setIsLoadingMore(false)
        }
    }

    const handleHumanInputSubmit = async (
        action: 'APPROVE' | 'DECLINE' | 'OVERRIDE',
        inputData: Record<string, any>,
        comments: string
    ) => {
        if (!selectedWorkflow) return

        try {
            // Log the workflow object structure for debugging
            console.log('Selected workflow:', selectedWorkflow)
            console.log('Input data:', inputData)

            // Get run ID - this should always be available
            const runId = selectedWorkflow.run.id

            // Get workflow ID directly from the run object (not needed for takePauseAction but keeping for logs)
            const workflowId = selectedWorkflow.run.workflow_id

            console.log('Workflow ID:', workflowId)
            console.log('Run ID:', runId)

            if (runId) {
                try {
                    // Create the action request object
                    const actionRequest: ResumeActionRequest = {
                        inputs: inputData,
                        user_id: 'current-user',
                        action,
                        comments,
                    }

                    // Call takePauseAction with the request
                    await takePauseAction(runId, actionRequest)

                    // Show success message
                    onAlert(`Workflow resumed with action: ${action}`, 'success')

                    // Close the modal
                    setIsHumanInputModalOpen(false)
                    setSelectedWorkflow(null)
                } catch (resumeError) {
                    console.error('Error resuming workflow:', resumeError)
                    onAlert('Failed to resume workflow', 'danger')
                }
            } else {
                console.error('Cannot resume workflow: Run ID is missing or invalid')
                onAlert('Cannot resume workflow: missing run ID', 'danger')
            }

            // Refresh paused workflows
            const paused = await listPausedWorkflows()
            setPausedWorkflows(paused)
        } catch (error) {
            console.error('Error submitting human input:', error)
            onAlert('Error submitting human input', 'danger')
        }
    }

    // Handle quick actions (approve/decline) directly from the dashboard
    const handleQuickAction = async (workflow: PausedWorkflowResponse, action: 'APPROVE' | 'DECLINE') => {
        try {
            const runId = workflow.run.id

            if (runId) {
                // Create a simple action request with empty inputs and comments
                const actionRequest: ResumeActionRequest = {
                    inputs: {},
                    user_id: 'current-user',
                    action,
                    comments: `Quick ${action.toLowerCase()} from dashboard`,
                }

                // Call takePauseAction with the request
                await takePauseAction(runId, actionRequest)

                // Show success message
                onAlert(`Workflow ${action.toLowerCase()}d successfully`, 'success')

                // Refresh paused workflows
                const paused = await listPausedWorkflows()
                setPausedWorkflows(paused)
            } else {
                console.error('Cannot perform action: Run ID is missing or invalid')
                onAlert('Cannot perform action: missing run ID', 'danger')
            }
        } catch (error) {
            console.error(`Error performing ${action} action:`, error)
            onAlert(`Failed to ${action.toLowerCase()} workflow`, 'danger')
        }
    }

    // Handle cancellation of a workflow
    const handleCancelWorkflow = async (workflow: PausedWorkflowResponse) => {
        try {
            const runId = workflow.run.id

            if (runId) {
                if (window.confirm(`Are you sure you want to cancel this workflow? This action cannot be undone.`)) {
                    // Call the cancelWorkflow API
                    await cancelWorkflow(runId)

                    // Show success message
                    onAlert('Workflow canceled successfully', 'success')

                    // Refresh paused workflows
                    const paused = await listPausedWorkflows()
                    setPausedWorkflows(paused)
                }
            } else {
                console.error('Cannot cancel workflow: Run ID is missing or invalid')
                onAlert('Cannot cancel workflow: missing run ID', 'danger')
            }
        } catch (error) {
            console.error('Error canceling workflow:', error)
            onAlert('Failed to cancel workflow', 'danger')
        }
    }

    const onJSONDrop = useCallback(
        (acceptedFiles: File[]) => {
            const file = acceptedFiles[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = async (e) => {
                try {
                    const result = e.target?.result
                    if (typeof result !== 'string') return
                    const jsonContent = JSON.parse(result)
                    const uniqueName = `Imported Spur ${new Date().toLocaleString()}`
                    const newWorkflow: WorkflowCreateRequest = {
                        name: uniqueName,
                        description: jsonContent.description,
                        definition: jsonContent.definition as WorkflowDefinition,
                    }
                    const createdWorkflow = await createWorkflow(newWorkflow)
                    router.push(`/workflows/${createdWorkflow.id}`)
                } catch (error) {
                    console.error('Error processing dropped JSON file:', error)
                    alert('Failed to import workflow. Please ensure the file is a valid JSON.')
                }
            }
            reader.readAsText(file)
        },
        [router]
    )

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: onJSONDrop,
        accept: { 'application/json': ['.json'] },
        noClick: true,
        noKeyboard: true,
    })

    return (
        <div {...getRootProps()} className="relative flex flex-col gap-2 max-w-7xl w-full mx-auto pt-2 px-6">
            <input {...getInputProps()} />
            {isDragActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg z-50 transition-all duration-300 animate-in fade-in">
                    <Upload className="w-16 h-16 text-primary mb-4" />
                    <p className="text-primary text-xl font-bold">Drop workflow JSON file here</p>
                    <p className="text-primary/80 text-sm mt-2">Release to import your workflow</p>
                </div>
            )}
            <Head>
                <link href="https://assets.calendly.com/assets/external/widget.css" rel="stylesheet" />
            </Head>

            {/* Alert message */}
            {showAlert && alertMessage && (
                <Alert className="mb-4" variant="solid" color={alertColor} onClose={() => setShowAlert(false)}>
                    {alertMessage}
                </Alert>
            )}

            <CalendlyWidget />
            <WelcomeModal isOpen={showWelcome} onClose={() => setShowWelcome(false)} />
            <div>
                {/* Dashboard Header */}
                <header className="mb-6 flex w-full items-center flex-col gap-2">
                    {!isLoadingApiKeys &&
                        (apiKeys.length === 0 || apiKeys.every((key) => !key.value || key.value === '')) && (
                            <div className="w-full">
                                <Alert
                                    variant="bordered"
                                    className="mb-2"
                                    startContent={<Icon icon="lucide:alert-triangle" width={16} />}
                                >
                                    No API keys have been set. Please configure your API keys in the settings to use the
                                    application.
                                </Alert>
                            </div>
                        )}
                    <div className="flex w-full items-center">
                        <div className="flex flex-col max-w-fit" id="dashboard-title">
                            <h1 className="text-lg font-bold text-default-900 lg:text-2xl">Dashboard</h1>
                            <p className="text-small text-default-400 lg:text-medium">Manage your spurs</p>
                        </div>
                        <div className="ml-auto flex items-center gap-2" id="new-workflow-entries">
                            <Button
                                className="bg-foreground text-background dark:bg-foreground/90 dark:text-background/90"
                                startContent={
                                    <Icon className="flex-none text-background/60" icon="lucide:plus" width={16} />
                                }
                                onPress={handleNewWorkflowClick}
                            >
                                New Spur
                            </Button>
                            <Button
                                className="bg-foreground text-background dark:bg-foreground/90 dark:text-background/90"
                                startContent={
                                    <Icon className="flex-none text-background/60" icon="lucide:upload" width={16} />
                                }
                                onPress={handleImportWorkflowClick}
                            >
                                Import Spur (or drop JSON file)
                            </Button>
                        </div>
                    </div>
                </header>

                {/* Wrap sections in Accordion */}
                <Accordion
                    defaultExpandedKeys={new Set(['workflows', 'templates', 'human-tasks'])}
                    selectionMode="multiple"
                >
                    <AccordionItem
                        key="workflows"
                        aria-label="Recent Spurs"
                        title={<h3 className="text-xl font-semibold">Recent Spurs</h3>}
                    >
                        {isLoadingWorkflows ? (
                            <div className="flex justify-center p-4">
                                <Spinner size="lg" />
                            </div>
                        ) : workflows.length > 0 ? (
                            <div className="flex flex-col gap-2">
                                <Table aria-label="Saved Workflows" isHeaderSticky>
                                    <TableHeader columns={columns}>
                                        {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
                                    </TableHeader>
                                    <TableBody items={workflows}>
                                        {(workflow) => (
                                            <TableRow
                                                key={workflow.id}
                                                className={`transition-colors duration-200 hover:bg-primary-50 dark:hover:bg-primary-800/10 ${
                                                    highlightedWorkflowId === workflow.id
                                                        ? 'bg-primary-50 dark:bg-primary-800/10'
                                                        : ''
                                                }`}
                                            >
                                                {(columnKey) => (
                                                    <TableCell>
                                                        {columnKey === 'action' ? (
                                                            <div className="flex items-center gap-2">
                                                                <Icon
                                                                    icon="solar:pen-bold"
                                                                    className="cursor-pointer text-default-400"
                                                                    height={18}
                                                                    width={18}
                                                                    onClick={() => handleEditClick(workflow)}
                                                                    aria-label="Edit"
                                                                />
                                                                <Icon
                                                                    icon="solar:copy-bold"
                                                                    className="cursor-pointer text-default-400"
                                                                    height={18}
                                                                    width={18}
                                                                    onClick={() => handleDuplicateClick(workflow)}
                                                                    aria-label="Duplicate"
                                                                />
                                                                <Icon
                                                                    icon="solar:trash-bin-trash-bold"
                                                                    className="cursor-pointer text-default-400"
                                                                    height={18}
                                                                    width={18}
                                                                    onClick={() => handleDeleteClick(workflow)}
                                                                    aria-label="Delete"
                                                                />
                                                            </div>
                                                        ) : columnKey === 'recentRuns' ? (
                                                            <div className="flex flex-wrap gap-2">
                                                                {workflowRuns[workflow.id]?.map((run) => (
                                                                    <Chip
                                                                        key={run.id}
                                                                        size="sm"
                                                                        variant="flat"
                                                                        className="cursor-pointer"
                                                                        onClick={() => handlePreviousRunClick(run.id)}
                                                                    >
                                                                        {run.id}
                                                                    </Chip>
                                                                ))}
                                                                {workflowRuns[workflow.id]?.length >= 5 && (
                                                                    <Chip
                                                                        size="sm"
                                                                        variant="flat"
                                                                        className="cursor-pointer"
                                                                        onClick={() =>
                                                                            window.open(
                                                                                `/runs/${workflow.id}`,
                                                                                '_blank'
                                                                            )
                                                                        }
                                                                        startContent={
                                                                            <Icon
                                                                                icon="solar:playlist-linear"
                                                                                width={14}
                                                                            />
                                                                        }
                                                                    >
                                                                        See All
                                                                    </Chip>
                                                                )}
                                                            </div>
                                                        ) : columnKey === 'name' ? (
                                                            <Chip
                                                                size="sm"
                                                                variant="flat"
                                                                className="cursor-pointer"
                                                                onClick={() => handleEditClick(workflow)}
                                                            >
                                                                {workflow.name}
                                                            </Chip>
                                                        ) : columnKey === 'spur_type' ? (
                                                            <SpurTypeChip spurType={workflow.definition.spur_type} />
                                                        ) : columnKey === 'updated_at' ? (
                                                            <span className="text-default-500">
                                                                {formatDate(getKeyValue(workflow, columnKey))}
                                                            </span>
                                                        ) : (
                                                            getKeyValue(workflow, columnKey)
                                                        )}
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                                {hasMoreWorkflows && (
                                    <div className="flex justify-center mt-4">
                                        <Button
                                            variant="flat"
                                            onPress={handleLoadMore}
                                            isLoading={isLoadingMore}
                                            startContent={!isLoadingMore && <Icon icon="lucide:plus" width={16} />}
                                        >
                                            {isLoadingMore ? 'Loading...' : 'Load More'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-12 my-8 bg-background rounded-xl border-border border shadow-sm">
                                <div className="max-w-2xl text-center mb-12">
                                    <h3 className="text-2xl font-semibold mb-4 text-foreground flex items-center justify-center gap-2">
                                        Welcome to PySpur!
                                    </h3>
                                    <p className="text-lg text-muted-foreground">
                                        Looks like you haven&apos;t created any spurs yet - let&apos;s get you started
                                        on your journey!
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
                                    <div
                                        className="flex flex-col items-center p-6 bg-background hover:bg-accent/5 rounded-xl border-border border transition-all hover:shadow-md cursor-pointer"
                                        onClick={handleNewWorkflowClick}
                                    >
                                        <div className="rounded-full bg-background p-4 mb-4 border border-border">
                                            <Icon icon="lucide:plus" className="w-8 h-8 text-foreground" />
                                        </div>
                                        <h4 className="text-lg font-medium mb-3 text-foreground">Create New</h4>
                                        <p className="text-medium text-center text-muted-foreground">
                                            Start fresh with your own creation using the &quot;New Spur&quot; button
                                            above
                                        </p>
                                    </div>

                                    <div
                                        className="flex flex-col items-center p-6 bg-background hover:bg-accent/5 rounded-xl border-border border transition-all hover:shadow-md cursor-pointer"
                                        onClick={handleImportWorkflowClick}
                                    >
                                        <div className="rounded-full bg-background p-4 mb-4 border border-border">
                                            <Icon icon="lucide:upload" className="w-8 h-8 text-foreground" />
                                        </div>
                                        <h4 className="text-lg font-medium mb-3 text-foreground">Import Existing</h4>
                                        <p className="text-medium text-center text-muted-foreground">
                                            Have a spur saved as JSON? Use the &quot;Import Spur&quot; button to bring
                                            it in
                                        </p>
                                    </div>

                                    <div
                                        className="flex flex-col items-center p-6 bg-background hover:bg-accent/5 rounded-xl border-border border transition-all hover:shadow-md cursor-pointer"
                                        onClick={() => {
                                            const templateSection = document.querySelector(
                                                '[aria-label="Spur Templates"]'
                                            )
                                            templateSection?.scrollIntoView({ behavior: 'smooth' })
                                        }}
                                    >
                                        <div className="rounded-full bg-background p-4 mb-4 border border-border">
                                            <Icon icon="lucide:layout-grid" className="w-8 h-8 text-foreground" />
                                        </div>
                                        <h4 className="text-lg font-medium mb-3 text-foreground">Use Template</h4>
                                        <p className="text-medium text-center text-muted-foreground">
                                            Get started quickly with our ready-to-go templates in the section below
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </AccordionItem>
                    <AccordionItem
                        key="human-tasks"
                        aria-label="Human Tasks"
                        title={
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-semibold">Spurs Awaiting Human Approval</h3>
                                {pausedWorkflows.length > 0 && (
                                    <Chip color="warning" variant="flat" size="sm">
                                        {pausedWorkflows.length}
                                    </Chip>
                                )}
                            </div>
                        }
                    >
                        {isLoadingPaused ? (
                            <div className="flex justify-center p-4">
                                <Spinner size="lg" />
                            </div>
                        ) : pausedWorkflows.length > 0 ? (
                            <div className="space-y-4">
                                {pausedWorkflows.map((workflow) => (
                                    <div
                                        key={workflow.run.id}
                                        className="flex items-center justify-between p-4 bg-content2 rounded-lg border border-border"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-medium">
                                                    {(workflow.workflow as WorkflowResponse).name}
                                                </h4>
                                                <Chip size="sm" color="warning">
                                                    Paused
                                                </Chip>
                                            </div>
                                            <p className="text-sm text-default-500 mb-2">
                                                {workflow.current_pause.pause_message}
                                            </p>
                                            <div className="flex items-center gap-4 text-xs text-default-400">
                                                <span>Run ID: {workflow.run.id}</span>
                                                <span>•</span>
                                                <span>
                                                    Paused{' '}
                                                    {formatDistanceToNow(new Date(workflow.current_pause.pause_time), {
                                                        addSuffix: true,
                                                    })}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                color="success"
                                                variant="flat"
                                                onPress={() => handleQuickAction(workflow, 'APPROVE')}
                                                startContent={<Icon icon="lucide:check" width={16} />}
                                                isIconOnly
                                                size="sm"
                                                aria-label="Approve"
                                            />
                                            <Button
                                                color="danger"
                                                variant="flat"
                                                onPress={() => handleQuickAction(workflow, 'DECLINE')}
                                                startContent={<Icon icon="lucide:x" width={16} />}
                                                isIconOnly
                                                size="sm"
                                                aria-label="Decline"
                                            />
                                            <Button
                                                color="primary"
                                                variant="bordered"
                                                onPress={() => {
                                                    setSelectedWorkflow(workflow)
                                                    setIsHumanInputModalOpen(true)
                                                }}
                                                startContent={<Icon icon="lucide:more-horizontal" width={16} />}
                                                isIconOnly
                                                size="sm"
                                                aria-label="Details"
                                            />
                                            <Button
                                                color="default"
                                                variant="light"
                                                onPress={() => handleCancelWorkflow(workflow)}
                                                startContent={<Icon icon="lucide:trash-2" width={16} />}
                                                isIconOnly
                                                size="sm"
                                                aria-label="Cancel Workflow"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-8 text-center">
                                <p className="text-muted-foreground">No tasks currently requiring human approval.</p>
                            </div>
                        )}
                    </AccordionItem>
                    <AccordionItem
                        key="templates"
                        aria-label="Spur Templates"
                        title={<h3 className="text-xl font-semibold mb-4">Spur Templates</h3>}
                    >
                        {/* Spur Templates Section */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 px-1 mb-8">
                            {templates.map((template) => (
                                <TemplateCard
                                    key={template.file_name}
                                    title={template.name}
                                    description={template.description}
                                    features={template.features}
                                    onUse={() => handleUseTemplate(template)}
                                />
                            ))}
                        </div>
                    </AccordionItem>
                </Accordion>
            </div>
            {selectedWorkflow && (
                <HumanInputModal
                    isOpen={isHumanInputModalOpen}
                    onClose={() => {
                        setIsHumanInputModalOpen(false)
                        setSelectedWorkflow(null)
                    }}
                    workflow={selectedWorkflow}
                    onSubmit={handleHumanInputSubmit}
                />
            )}
            {/* New Spur Type Modal */}
            <Modal isOpen={isNewSpurModalOpen} onClose={onCloseNewSpurModal}>
                <ModalContent>
                    <ModalHeader className="flex flex-col gap-1">Create New Spur</ModalHeader>
                    <ModalBody>
                        <RadioGroup
                            label="Select the type of spur you want to create"
                            value={selectedSpurType}
                            onChange={(e) => setSelectedSpurType(e.target.value as SpurType)}
                        >
                            <Radio
                                value={SpurType.WORKFLOW}
                                description="Create a standard workflow with nodes and edges"
                            >
                                <div className="flex items-center gap-2">
                                    <Icon icon="lucide:workflow" width={20} />
                                    <span>Workflow</span>
                                </div>
                            </Radio>
                            <Radio
                                value={SpurType.CHATBOT}
                                description="Create a chatbot with session management and conversational I/O"
                            >
                                <div className="flex items-center gap-2">
                                    <Icon icon="lucide:message-square" width={20} />
                                    <span>Chatbot</span>
                                </div>
                            </Radio>
                        </RadioGroup>
                    </ModalBody>
                    <ModalFooter>
                        <Button color="danger" variant="light" onPress={onCloseNewSpurModal}>
                            Cancel
                        </Button>
                        <Button color="primary" onPress={handleCreateNewSpur}>
                            Create
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    )
}

export default Dashboard
