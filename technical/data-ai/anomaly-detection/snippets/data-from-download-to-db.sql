SELECT * FROM transaction_details;
SELECT * FROM transaction_header;


CREATE TABLE staging_transaction_header (
  "Branch Code" TEXT,
  "DocId" TEXT,
  "DocDate" TEXT,
  "New_Old" TEXT
  -- adjust types for other columns or add them as TEXT
);

COPY staging_transaction_header("Branch Code", "DocId", "DocDate", "New_Old")
FROM 'C:\Users\sushants\Downloads\Transaction_Header 1.csv'
DELIMITER ','
CSV HEADER;

INSERT INTO transaction_header("Branch Code", "DocId", "DocDate", "New_Old")
SELECT
  "Branch Code",
  "DocId",
  CASE
    WHEN "DocDate" ~ '^[0-9]+/[0-9]+/[0-9]+ .*AM|PM$'
    THEN TO_TIMESTAMP("DocDate", 'MM/DD/YYYY HH12:MI:SS AM')
    WHEN "DocDate" ~ '^[0-9]+-[0-9]+-[0-9]+ [0-9]{2}:[0-9]{2}$'
    THEN TO_TIMESTAMP("DocDate", 'MM-DD-YYYY HH24:MI')
    ELSE NULL  -- or handle unexpected formats
  END AS "DocDate",
  "New_Old"
FROM staging_transaction_header;

DROP TABLE staging_transaction_header;