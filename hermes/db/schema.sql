-- schema.sql — regenerated reference dump of the current Hermes schema.
-- Source of truth is db/migrations/*.sql. Do not hand-edit; regenerate with:
--   pnpm migrate && scripts/dump-schema.sh

-- PostgreSQL database dump
-- Name: _migrations; Type: TABLE; Schema: public; Owner: -
CREATE TABLE public._migrations (
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);
-- Name: devices; Type: TABLE; Schema: public; Owner: -
CREATE TABLE public.devices (
    id uuid NOT NULL,
    label text NOT NULL,
    token_hash text NOT NULL,
    scopes jsonb DEFAULT '["read"]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);
-- Name: events; Type: TABLE; Schema: public; Owner: -
CREATE TABLE public.events (
    id uuid NOT NULL,
    ts timestamp with time zone NOT NULL,
    ingest_ts timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    kind text NOT NULL,
    actor text NOT NULL,
    channel text DEFAULT '-'::text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    body text NOT NULL,
    entities jsonb DEFAULT '[]'::jsonb NOT NULL,
    correlation_id uuid,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    raw jsonb DEFAULT '{}'::jsonb NOT NULL,
    seq bigint
);
-- Name: events_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
CREATE SEQUENCE public.events_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
-- Name: events_seq_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
ALTER SEQUENCE public.events_seq_seq OWNED BY public.events.seq;
-- Name: incidents; Type: TABLE; Schema: public; Owner: -
CREATE TABLE public.incidents (
    id uuid NOT NULL,
    opened_at timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    title text NOT NULL,
    primary_entity text,
    severity text DEFAULT 'info'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL
);
-- Name: events seq; Type: DEFAULT; Schema: public; Owner: -
ALTER TABLE ONLY public.events ALTER COLUMN seq SET DEFAULT nextval('public.events_seq_seq'::regclass);
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public._migrations
    ADD CONSTRAINT _migrations_pkey PRIMARY KEY (name);
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (id);
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);
-- Name: incidents incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);
-- Name: devices_token_hash; Type: INDEX; Schema: public; Owner: -
CREATE INDEX devices_token_hash ON public.devices USING btree (token_hash);
-- Name: events_corr; Type: INDEX; Schema: public; Owner: -
CREATE INDEX events_corr ON public.events USING btree (correlation_id);
-- Name: events_ent_gin; Type: INDEX; Schema: public; Owner: -
CREATE INDEX events_ent_gin ON public.events USING gin (entities);
-- Name: events_seq_uidx; Type: INDEX; Schema: public; Owner: -
CREATE UNIQUE INDEX events_seq_uidx ON public.events USING btree (seq);
-- Name: events_tag_gin; Type: INDEX; Schema: public; Owner: -
CREATE INDEX events_tag_gin ON public.events USING gin (tags);
-- Name: events_ts_brin; Type: INDEX; Schema: public; Owner: -
CREATE INDEX events_ts_brin ON public.events USING brin (ts);
-- Name: incidents_entity; Type: INDEX; Schema: public; Owner: -
CREATE INDEX incidents_entity ON public.incidents USING btree (primary_entity);
-- Name: incidents_status; Type: INDEX; Schema: public; Owner: -
CREATE INDEX incidents_status ON public.incidents USING btree (status);
-- PostgreSQL database dump complete
