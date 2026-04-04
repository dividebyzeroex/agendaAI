-- Migration: 2026-04-03 14:15 - Chatbot Integrations (FIXED TABLE NAME)
-- Create a table to store social media integration tokens and configuration.
-- Corrected table reference: public.estabelecimento (singular)

CREATE TABLE IF NOT EXISTS public.chatbot_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID REFERENCES public.estabelecimento(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('whatsapp', 'facebook', 'instagram')),
    status VARCHAR(20) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
    config JSONB DEFAULT '{}'::jsonb, -- Stores Phone ID, Messaging ID, Access Token, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(establishment_id, channel)
);

-- Enable RLS
ALTER TABLE public.chatbot_integrations ENABLE ROW LEVEL SECURITY;

-- Policy: Establishments can only manage their own chatbot integrations
-- Assuming user_id exists in public.estabelecimento
DROP POLICY IF EXISTS "Establishments can manage their own chatbot integrations" ON public.chatbot_integrations;
CREATE POLICY "Establishments can manage their own chatbot integrations"
ON public.chatbot_integrations
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.estabelecimento 
        WHERE id = chatbot_integrations.establishment_id 
        AND user_id = auth.uid()
    )
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_chatbot_integrations_updated_at ON public.chatbot_integrations;
CREATE TRIGGER update_chatbot_integrations_updated_at
    BEFORE UPDATE ON public.chatbot_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
